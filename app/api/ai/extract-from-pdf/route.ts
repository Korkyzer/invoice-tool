import { NextResponse } from "next/server";
import OpenAI from "openai";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

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
`;

type JsonObject = Record<string, unknown>;

function safeJsonParse(input: string) {
  try {
    const trimmed = input.trim();
    const cleaned = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      : trimmed;
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return {};
  } catch {
    return {};
  }
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[€$]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .trim();
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();

  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return input;

  const fr = input.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (fr) {
    const [, dd, mm, yyyy] = fr;
    return `${yyyy}-${mm}-${dd}`;
  }
  return undefined;
}

function normalizeVat(value: unknown): number {
  const rate = parseNumberish(value);
  const allowed = [0, 5.5, 10, 20];
  if (allowed.includes(rate)) return rate;
  if (rate <= 0.5) return 0;
  if (rate <= 7.75) return 5.5;
  if (rate <= 15) return 10;
  return 20;
}

function sanitizePatch(patch: JsonObject) {
  const out: JsonObject = {};

  if (patch.client && typeof patch.client === "object" && !Array.isArray(patch.client)) {
    const raw = patch.client as JsonObject;
    const client: JsonObject = {};
    for (const key of ["company_name", "contact_name", "email", "address", "siret"] as const) {
      const value = raw[key];
      if (typeof value === "string" && value.trim()) {
        client[key] = value.trim();
      }
    }
    if (Object.keys(client).length) out.client = client;
  }

  if (Array.isArray(patch.lines)) {
    const lines = patch.lines
      .map((line) => {
        if (!line || typeof line !== "object") return null;
        const raw = line as JsonObject;
        const description = String(raw.description ?? "").trim();
        const quantity = parseNumberish(raw.quantity);
        const unit_price = parseNumberish(raw.unit_price);
        const vat_rate = normalizeVat(raw.vat_rate);

        if (!description || quantity <= 0 || unit_price < 0) return null;
        return { description, quantity, unit_price, vat_rate };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));

    if (lines.length) out.lines = lines;
  }

  const issueDate = normalizeDate(patch.issue_date);
  if (issueDate) out.issue_date = issueDate;

  const dueDate = normalizeDate(patch.due_date);
  if (dueDate) out.due_date = dueDate;

  if (typeof patch.notes === "string" && patch.notes.trim()) {
    out.notes = patch.notes.trim();
  }

  if (typeof patch.payment_terms === "string" && patch.payment_terms.trim()) {
    out.payment_terms = patch.payment_terms.trim();
  }

  return out;
}

function hasMeaningfulPatch(patch: JsonObject) {
  return Object.keys(patch).length > 0;
}

function extractPatchHeuristics(text: string): JsonObject {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const out: JsonObject = {};

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const siret = text.match(/(?:SIRET|SIREN)\s*[:\-]?\s*(\d{9,14})/i)?.[1];
  const issueDateRaw = text.match(/Date[^\n:]*[:\-]\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)?.[1];

  const companyCandidates = lines.filter((line) => {
    const lowered = line.toLowerCase();
    if (line.length < 2 || line.length > 60) return false;
    if (/\d/.test(line)) return false;
    if (/[€@]/.test(line)) return false;
    if (
      /facture|date|désignation|sous-total|total|iban|bic|swift|tva|siret|siren|paiement|virement/.test(
        lowered,
      )
    ) {
      return false;
    }
    const upper = line.replace(/[^A-ZÀ-Ÿ]/g, "").length;
    return upper >= Math.max(3, Math.floor(line.length * 0.5));
  });

  const address = lines.find((line) => /\b\d{5}\b/.test(line) && /[A-Za-zÀ-ÿ]/.test(line));

  const client: JsonObject = {};
  if (companyCandidates[0]) client.company_name = companyCandidates[0];
  if (email) client.email = email;
  if (address) client.address = address;
  if (siret) client.siret = siret;
  if (Object.keys(client).length) out.client = client;

  const inferredVatRate =
    text.match(/TVA\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i)?.[1] ??
    (text.match(/TVA\s+non\s+applicable|art\.?\s*293\s*B/i) ? "0" : "20");

  const extractedLines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
  }> = [];

  for (const rawLine of lines) {
    const lowered = rawLine.toLowerCase();
    if (
      /désignation|sous-total|total|iban|bic|swift|facture|date|paiement|tva non applicable|virement/.test(
        lowered,
      )
    ) {
      continue;
    }

    const match = rawLine.match(
      /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s]+[.,]\d{2})\s*€?\s+([\d\s]+[.,]\d{2})\s*€?$/,
    );
    if (!match) continue;

    const [, desc, qtyRaw, unitRaw] = match;
    const description = desc.trim();
    const quantity = parseNumberish(qtyRaw);
    const unit_price = parseNumberish(unitRaw);

    if (!description || quantity <= 0 || unit_price <= 0) continue;

    extractedLines.push({
      description,
      quantity,
      unit_price,
      vat_rate: normalizeVat(inferredVatRate),
    });
  }

  if (extractedLines.length) out.lines = extractedLines;

  const issueDate = normalizeDate(issueDateRaw);
  if (issueDate) out.issue_date = issueDate;

  if (/TVA\s+non\s+applicable|art\.?\s*293\s*B/i.test(text)) {
    out.notes = "TVA non applicable, art. 293 B du CGI.";
  }

  if (/au comptant/i.test(text)) {
    out.payment_terms = "Paiement comptant par virement.";
  }

  return out;
}

async function extractNativePdfText(bytes: Buffer) {
  const pdfjsPath = join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs");
  const pdfjsUrl = pathToFileURL(pdfjsPath).href;
  const dynamicImport = new Function("url", "return import(url);") as (
    url: string,
  ) => Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>;
  const pdfjs = await dynamicImport(pdfjsUrl);

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  const doc = await loadingTask.promise;
  const chunks: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
      const page = await doc.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? String(item.str ?? "") : ""))
        .join(" ")
        .trim();

      if (pageText) {
        chunks.push(pageText);
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return chunks.join("\n");
}

async function extractPatchWithModel({
  client,
  model,
  userMessageWithContext,
}: {
  client: OpenAI;
  model: string;
  userMessageWithContext: string;
}) {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: PATCH_SYSTEM },
        { role: "user", content: userMessageWithContext },
      ],
      max_tokens: 900,
      temperature: 0.1,
      response_format: { type: "json_object" } as never,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    return sanitizePatch(safeJsonParse(content));
  } catch {
    const fallback = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: PATCH_SYSTEM },
        { role: "user", content: userMessageWithContext },
      ],
      max_tokens: 900,
      temperature: 0.1,
    });

    const content = fallback.choices[0]?.message?.content ?? "{}";
    return sanitizePatch(safeJsonParse(content));
  }
}

export async function POST(request: Request) {
  let stage = "start";
  try {
    stage = "env";
    const hasApiKey = Boolean(process.env.MAMMOUTH_API_KEY);

    stage = "formdata";
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

    stage = "pdf-read";
    const bytes = Buffer.from(await file.arrayBuffer());
    stage = "pdf-text";
    const nativeText = (await extractNativePdfText(bytes))
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 30000);

    const client = hasApiKey
      ? new OpenAI({
          apiKey: process.env.MAMMOUTH_API_KEY,
          baseURL: "https://api.mammouth.ai/v1",
        })
      : null;

    const ocrText = "";
    const shouldRunOcr = false;

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

    const modelPatch = client
      ? await extractPatchWithModel({
          // patch inference
          client,
          model: patchModel,
          userMessageWithContext,
        })
      : {};

    let patch = modelPatch;
    let source: "model" | "heuristic" = "model";

    if (!hasMeaningfulPatch(modelPatch)) {
      patch = sanitizePatch(extractPatchHeuristics(combinedText));
      source = "heuristic";
    }

    return NextResponse.json({
      patch,
      source,
      error: hasApiKey ? undefined : "missing_api_key_heuristic_only",
      stage: "done",
      extractedChars: combinedText.length,
      nativeChars: nativeText.length,
      ocrChars: ocrText.length,
      usedOcr: shouldRunOcr && ocrText.length > 0,
      patchModel,
    });
  } catch (error) {
    return NextResponse.json(
      {
        patch: {},
        error: (error as Error).message ?? "pdf_extract_failed",
        stage,
      },
      { status: 200 },
    );
  }
}
