import { NextResponse } from "next/server";
import OpenAI from "openai";

const PDF_ASSISTANT_SYSTEM = `
Tu es un assistant qui extrait des informations de factures/devis français.
Tu reçois:
1) l'état actuel de la facture cible (JSON),
2) le texte extrait d'un PDF d'une ancienne facture.

Tu dois répondre UNIQUEMENT avec un objet JSON valide contenant les champs à mettre à jour.
Ne réponds jamais avec des explications.
Si tu ne comprends pas, réponds avec: {}

Champs de la facture que tu peux modifier:
- client: { company_name, contact_name, email, address, siret }
- lines: tableau de { description, quantity, unit_price, vat_rate } (vat_rate: 0, 5.5, 10 ou 20)
- issue_date: string ISO (ex: "2025-03-15")
- due_date: string ISO
- notes: string
- payment_terms: string

Règles:
- Extrait le plus d'informations fiables possible.
- N'invente pas de données absentes.
- Si une TVA n'est pas explicitement trouvée, utilise 20.
- Si une ligne est ambiguë, ne la renvoie pas.
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
      return NextResponse.json({ patch: {}, error: "missing_api_key" }, { status: 200 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const rawCurrentState = formData.get("currentInvoiceState");

    if (!(file instanceof File)) {
      return NextResponse.json({ patch: {}, error: "missing_file" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ patch: {}, error: "invalid_file_type" }, { status: 400 });
    }

    const currentInvoiceState =
      typeof rawCurrentState === "string" ? safeJsonParse(rawCurrentState) : {};

    const bytes = Buffer.from(await file.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    const textResult = await parser.getText();
    await parser.destroy();

    const extractedText = (textResult.text ?? "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 30000);

    if (!extractedText || extractedText.length < 40) {
      return NextResponse.json({ patch: {}, error: "empty_pdf_text" }, { status: 200 });
    }

    const client = new OpenAI({
      apiKey: process.env.MAMMOUTH_API_KEY,
      baseURL: "https://api.mammouth.ai/v1",
    });

    const model = process.env.MAMMOUTH_PDF_MODEL || "mistral-small-3.2-24b-instruct";

    const userMessageWithContext = `
État actuel de la facture cible: ${JSON.stringify(currentInvoiceState, null, 2)}

Texte extrait du PDF source:
${extractedText}
`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: PDF_ASSISTANT_SYSTEM },
        { role: "user", content: userMessageWithContext },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const patch = safeJsonParse(content);

    return NextResponse.json({ patch, extractedChars: extractedText.length, model });
  } catch (error) {
    return NextResponse.json(
      { patch: {}, error: (error as Error).message ?? "pdf_extract_failed" },
      { status: 200 },
    );
  }
}
