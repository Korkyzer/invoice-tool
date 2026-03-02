import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  currentInvoiceState: z.record(z.string(), z.any()),
  userInput: z.string().min(1),
});

const INVOICE_ASSISTANT_SYSTEM = `
Tu es un assistant qui aide à remplir des factures et devis français.
Tu reçois l'état actuel de la facture en JSON et un message utilisateur.
Tu dois répondre UNIQUEMENT avec un objet JSON valide contenant les champs à mettre à jour.
Ne réponds jamais avec des explications. Retourne uniquement le JSON patch.
Si tu ne comprends pas, réponds avec: {}

Champs de la facture que tu peux modifier:
- client: { company_name, contact_name, email, address, siret }
- lines: tableau de { description, quantity, unit_price, vat_rate } (vat_rate: 0, 5.5, 10 ou 20)
- issue_date: string ISO (ex: "2025-03-15")
- due_date: string ISO
- notes: string (texte libre en bas de facture)
- payment_terms: string (ex: "Paiement à 30 jours")

Règles importantes:
- Si on te fournit un contexte web, utilise uniquement ces données pour les infos d'entreprise.
- Ne jamais inventer un SIREN/SIRET.
- Si on te demande un SIREN, tu peux renseigner client.siret avec la valeur trouvée.
`;

type SerperResult = {
  title?: string;
  snippet?: string;
  link?: string;
};

async function fetchSerperContext(query: string): Promise<string> {
  if (!process.env.SERPER_API_KEY) return "";

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "fr",
        hl: "fr",
        num: 5,
      }),
    });

    if (!response.ok) return "";

    const json = (await response.json()) as {
      organic?: SerperResult[];
      knowledgeGraph?: {
        title?: string;
        description?: string;
        website?: string;
      };
    };

    const rows: string[] = [];

    if (json.knowledgeGraph) {
      rows.push(
        `KnowledgeGraph: ${json.knowledgeGraph.title ?? ""} - ${json.knowledgeGraph.description ?? ""} (${json.knowledgeGraph.website ?? ""})`,
      );
    }

    for (const item of json.organic ?? []) {
      rows.push(
        `Source: ${item.title ?? ""} | ${item.snippet ?? ""} | ${item.link ?? ""}`.trim(),
      );
    }

    return rows.join("\n").slice(0, 5000);
  } catch {
    return "";
  }
}

function safeJsonParse(input: string) {
  try {
    const trimmed = input.trim();
    const cleaned = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      : trimmed;
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.MAMMOUTH_API_KEY) {
      return NextResponse.json({ patch: {} }, { status: 200 });
    }

    const client = new OpenAI({
      apiKey: process.env.MAMMOUTH_API_KEY,
      baseURL: "https://api.mammouth.ai/v1",
    });

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ patch: {} }, { status: 400 });
    }

    const shouldSearchWeb =
      /\b(trouve|recherche|chercher|find|look up|siren|siret|société|societe|pappers|societe\.com)\b/i.test(
        parsed.data.userInput,
      );

    const webContext = shouldSearchWeb ? await fetchSerperContext(parsed.data.userInput) : "";

    const userMessageWithContext = `
État actuel de la facture: ${JSON.stringify(parsed.data.currentInvoiceState, null, 2)}

Message utilisateur: ${parsed.data.userInput}

Contexte web (optionnel): ${
      webContext || "Aucun contexte web disponible ou SERPER_API_KEY non configurée."
    }
`;

    const response = await client.chat.completions.create({
      model: "mistral-small-3.2-24b-instruct",
      messages: [
        { role: "system", content: INVOICE_ASSISTANT_SYSTEM },
        { role: "user", content: userMessageWithContext },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const patch = safeJsonParse(content);

    return NextResponse.json({ patch });
  } catch {
    return NextResponse.json({ patch: {} }, { status: 200 });
  }
}
