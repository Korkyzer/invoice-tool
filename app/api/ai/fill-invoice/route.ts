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
`;

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

    const userMessageWithContext = `
État actuel de la facture: ${JSON.stringify(parsed.data.currentInvoiceState, null, 2)}

Message utilisateur: ${parsed.data.userInput}
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
