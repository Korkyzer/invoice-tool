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
- client: { company_name, contact_name, email, phone, address, siret, tva_number, website }
- lines: tableau de { description, quantity, unit_price, vat_rate } (vat_rate: 0, 5.5, 10 ou 20)
- issue_date: string ISO (ex: "2025-03-15")
- due_date: string ISO
- notes: string (texte libre en bas de facture)
- payment_terms: string (ex: "Paiement à 30 jours")

Règles importantes:
- Si on te fournit un contexte web, utilise ces sources pour les infos d'entreprise (SIREN/SIRET, TVA, adresse, téléphone, email, site).
- Ne jamais inventer un SIREN/SIRET.
- Ne jamais inventer un numéro de TVA intracommunautaire.
- Si l'utilisateur demande des infos d'entreprise (SIREN/SIRET, TVA, adresse, téléphone, email, site), retourne-les dans client.
- Si l'information demandée n'est pas trouvée avec fiabilité, ne pas la renseigner.
`;

type SerperResult = {
  title?: string;
  snippet?: string;
  link?: string;
};

type SerperResponse = {
  organic?: SerperResult[];
  answerBox?: Record<string, unknown>;
  knowledgeGraph?: {
    title?: string;
    description?: string;
    website?: string;
    [key: string]: unknown;
  };
  peopleAlsoAsk?: Array<Record<string, unknown>>;
};

function extractCompanyHint(input: string) {
  const quoted = input.match(/["“”']([^"“”']{2,80})["“”']/)?.[1];
  if (quoted) return quoted.trim();

  const afterKeyword = input.match(
    /(?:de|d'|pour|societe|société|company|entreprise)\s+([A-Za-z0-9&' .-]{2,80})/i,
  )?.[1];
  if (afterKeyword) return afterKeyword.trim();

  return "";
}

async function searchSerper(query: string): Promise<SerperResponse | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "fr",
      hl: "fr",
      num: 6,
      autocorrect: true,
    }),
  });

  if (!response.ok) return null;
  return (await response.json()) as SerperResponse;
}

async function fetchSerperContext(query: string): Promise<string> {
  if (!process.env.SERPER_API_KEY) return "";

  try {
    const companyHint = extractCompanyHint(query);
    const querySet = new Set<string>([
      query,
      `${query} informations entreprise`,
    ]);

    if (companyHint) {
      querySet.add(`${companyHint} siren siret tva intracom adresse téléphone email site`);
      querySet.add(`${companyHint} pappers`);
      querySet.add(`${companyHint} societe.com`);
    }

    const rows: string[] = [];
    let totalSources = 0;

    for (const q of Array.from(querySet).slice(0, 4)) {
      const json = await searchSerper(q);
      if (!json) continue;

      rows.push(`Requête: ${q}`);

      if (json.answerBox && Object.keys(json.answerBox).length > 0) {
        rows.push(`AnswerBox: ${JSON.stringify(json.answerBox).slice(0, 1200)}`);
      }

      if (json.knowledgeGraph) {
        rows.push(
          `KnowledgeGraph: ${json.knowledgeGraph.title ?? ""} - ${json.knowledgeGraph.description ?? ""} (${json.knowledgeGraph.website ?? ""})`,
        );
      }

      for (const item of json.organic ?? []) {
        totalSources += 1;
        rows.push(
          `Source: ${item.title ?? ""} | ${item.snippet ?? ""} | ${item.link ?? ""}`.trim(),
        );
      }

      for (const item of json.peopleAlsoAsk ?? []) {
        const question = typeof item.question === "string" ? item.question : "";
        const snippet = typeof item.snippet === "string" ? item.snippet : "";
        const link = typeof item.link === "string" ? item.link : "";
        if (!question && !snippet) continue;
        totalSources += 1;
        rows.push(`PAA: ${question} | ${snippet} | ${link}`);
      }
    }

    if (rows.length === 0) return "";

    rows.unshift(`Contexte web agrégé (${totalSources} sources max, non garanti).`);
    return rows.join("\n").slice(0, 9000);
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
      Boolean(process.env.SERPER_API_KEY) &&
      /\b(trouve|recherche|chercher|find|look up|lookup|infos?|information|coordonn|siren|siret|tva|intracom|adresse|téléphone|telephone|tel|email|mail|site|website|société|societe|entreprise|company|pappers|societe\.com)\b/i.test(
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
