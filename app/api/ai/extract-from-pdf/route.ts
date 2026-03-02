import { NextResponse } from "next/server";
import OpenAI from "openai";

const PATCH_SYSTEM = `
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

const OCR_SYSTEM = `
Tu fais de l'OCR sur des pages de facture/devis en français.
Tu dois retourner uniquement du texte brut fidèle au document (sans markdown, sans JSON).
Garde les montants, dates, coordonnées, lignes et taux TVA si visibles.
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

async function performVisionOcr({
  client,
  imageDataUrls,
  model,
}: {
  client: OpenAI;
  imageDataUrls: string[];
  model: string;
}) {
  if (!imageDataUrls.length) return "";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: OCR_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Extrais le texte complet et lisible de ces pages." },
          ...imageDataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0,
  });

  return (response.choices[0]?.message?.content ?? "").trim();
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

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ patch: {}, error: "file_too_large" }, { status: 400 });
    }

    const currentInvoiceState =
      typeof rawCurrentState === "string" ? safeJsonParse(rawCurrentState) : {};

    const bytes = Buffer.from(await file.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });

    const textResult = await parser.getText();
    const nativeText = (textResult.text ?? "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 30000);

    const maxPages = Math.max(
      1,
      Math.min(Number(process.env.MAMMOUTH_OCR_MAX_PAGES ?? 2), 4),
    );

    const screenshots = await parser.getScreenshot({
      first: maxPages,
      imageDataUrl: true,
      imageBuffer: false,
      desiredWidth: 1400,
    });

    const imageDataUrls = (screenshots.pages ?? [])
      .map((page) => page.dataUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, maxPages);

    await parser.destroy();

    const client = new OpenAI({
      apiKey: process.env.MAMMOUTH_API_KEY,
      baseURL: "https://api.mammouth.ai/v1",
    });

    let ocrText = "";
    const shouldRunOcr = nativeText.length < 160 && imageDataUrls.length > 0;
    if (shouldRunOcr) {
      try {
        const ocrModel = process.env.MAMMOUTH_OCR_MODEL || "gpt-4o";
        ocrText = await performVisionOcr({
          client,
          imageDataUrls,
          model: ocrModel,
        });
      } catch {
        ocrText = "";
      }
    }

    const combinedText = [nativeText, ocrText]
      .filter((chunk) => chunk && chunk.trim().length > 0)
      .join("\n\n----- OCR -----\n\n")
      .trim();

    if (!combinedText || combinedText.length < 40) {
      return NextResponse.json({ patch: {}, error: "empty_pdf_text" }, { status: 200 });
    }

    const patchModel = process.env.MAMMOUTH_PDF_MODEL || "mistral-small-3.2-24b-instruct";

    const userMessageWithContext = `
État actuel de la facture cible: ${JSON.stringify(currentInvoiceState, null, 2)}

Texte extrait du PDF source:
${combinedText.slice(0, 45000)}
`;

    const response = await client.chat.completions.create({
      model: patchModel,
      messages: [
        { role: "system", content: PATCH_SYSTEM },
        { role: "user", content: userMessageWithContext },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const patch = safeJsonParse(content);

    return NextResponse.json({
      patch,
      extractedChars: combinedText.length,
      nativeChars: nativeText.length,
      ocrChars: ocrText.length,
      usedOcr: shouldRunOcr && ocrText.length > 0,
      patchModel,
    });
  } catch (error) {
    return NextResponse.json(
      { patch: {}, error: (error as Error).message ?? "pdf_extract_failed" },
      { status: 200 },
    );
  }
}
