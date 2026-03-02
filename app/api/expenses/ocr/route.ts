import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OcrExpenseSchema = z.object({
  montant_ttc: z.number(),
  montant_ht: z.number().nullable(),
  tva: z.number().nullable(),
  devise: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marchand: z.string().min(1),
  categorie: z.enum(["restaurant", "transport", "hebergement", "materiel", "logiciel", "autre"]),
  description: z.string().nullable(),
  numero_facture: z.string().nullable(),
});

type OcrExpensePayload = z.infer<typeof OcrExpenseSchema>;

const OCR_SYSTEM = `
Tu extrais des informations de note de frais.
Retourne UNIQUEMENT un objet JSON valide avec les champs:
{
  "montant_ttc": number,
  "montant_ht": number | null,
  "tva": number | null,
  "devise": "EUR" | string,
  "date": "YYYY-MM-DD",
  "marchand": string,
  "categorie": "restaurant" | "transport" | "hebergement" | "materiel" | "logiciel" | "autre",
  "description": string | null,
  "numero_facture": string | null
}

Règles:
- Ne jamais ajouter de texte hors JSON.
- Si une valeur est inconnue, mettre null (ou "autre" pour categorie).
- Date au format ISO YYYY-MM-DD.
- Montants en nombre (pas de devise ni texte).
`;

function jsonError(error: string, code: string, status = 400) {
  return NextResponse.json({ error, code }, { status });
}

function safeJsonParse(input: string) {
  try {
    const trimmed = input.trim();
    const cleaned = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      : trimmed;
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,.-]/g, "").replace(",", ".").trim();
    const asNumber = Number(cleaned);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const fr = input.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return null;
}

function estimateConfidence(payload: OcrExpensePayload): number {
  let score = 0.25;
  if (payload.montant_ttc > 0) score += 0.25;
  if (payload.date) score += 0.15;
  if (payload.marchand.length >= 2) score += 0.15;
  if (payload.devise.length >= 2) score += 0.1;
  if (payload.categorie !== "autre") score += 0.05;
  if (payload.numero_facture) score += 0.05;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function ensurePdfJsNodePolyfills() {
  const g = globalThis as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      is2D = true;
      isIdentity = true;

      constructor(init?: number[] | Float32Array | Float64Array | string | DOMMatrixPolyfill) {
        if (Array.isArray(init) || init instanceof Float32Array || init instanceof Float64Array) {
          const values = Array.from(init);
          if (values.length >= 6) {
            this.a = values[0] ?? this.a;
            this.b = values[1] ?? this.b;
            this.c = values[2] ?? this.c;
            this.d = values[3] ?? this.d;
            this.e = values[4] ?? this.e;
            this.f = values[5] ?? this.f;
            this.m11 = this.a;
            this.m12 = this.b;
            this.m21 = this.c;
            this.m22 = this.d;
            this.m41 = this.e;
            this.m42 = this.f;
          }
        } else if (init && typeof init === "object") {
          const matrix = init as DOMMatrixPolyfill;
          this.a = Number(matrix.a ?? this.a);
          this.b = Number(matrix.b ?? this.b);
          this.c = Number(matrix.c ?? this.c);
          this.d = Number(matrix.d ?? this.d);
          this.e = Number(matrix.e ?? this.e);
          this.f = Number(matrix.f ?? this.f);
          this.m11 = Number(matrix.m11 ?? this.a);
          this.m12 = Number(matrix.m12 ?? this.b);
          this.m21 = Number(matrix.m21 ?? this.c);
          this.m22 = Number(matrix.m22 ?? this.d);
          this.m41 = Number(matrix.m41 ?? this.e);
          this.m42 = Number(matrix.m42 ?? this.f);
        }
      }

      static fromMatrix(init?: unknown) {
        return new DOMMatrixPolyfill(init as never);
      }

      multiply() {
        return new DOMMatrixPolyfill(this);
      }

      multiplySelf() {
        return this;
      }

      preMultiplySelf() {
        return this;
      }

      inverse() {
        return new DOMMatrixPolyfill(this);
      }

      invertSelf() {
        return this;
      }

      transformPoint(point?: { x?: number; y?: number; z?: number; w?: number }) {
        return {
          x: Number(point?.x ?? 0),
          y: Number(point?.y ?? 0),
          z: Number(point?.z ?? 0),
          w: Number(point?.w ?? 1),
        };
      }
    }
    g.DOMMatrix = DOMMatrixPolyfill;
  }

  if (typeof g.ImageData === "undefined") {
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = Number(width ?? 0);
          this.data = new Uint8ClampedArray(Math.max(0, this.width * this.height * 4));
        } else {
          this.data = dataOrWidth;
          this.width = Number(width ?? 0);
          this.height = Number(height ?? 0);
        }
      }
    }
    g.ImageData = ImageDataPolyfill;
  }

  if (typeof g.Path2D === "undefined") {
    class Path2DPolyfill {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      rect() {}
    }
    g.Path2D = Path2DPolyfill;
  }
}

async function extractPdfText(bytes: Buffer) {
  ensurePdfJsNodePolyfills();
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
    for (let page = 1; page <= doc.numPages; page += 1) {
      const currentPage = await doc.getPage(page);
      const textContent = await currentPage.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? String(item.str ?? "") : ""))
        .join(" ")
        .trim();
      if (pageText) chunks.push(pageText);
      currentPage.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return chunks.join("\n").slice(0, 30000);
}

function sanitizePayload(raw: unknown): OcrExpensePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const candidate = {
    montant_ttc: normalizeNumber(input.montant_ttc) ?? 0,
    montant_ht: normalizeNumber(input.montant_ht),
    tva: normalizeNumber(input.tva),
    devise: String(input.devise ?? "EUR").trim() || "EUR",
    date: normalizeDate(input.date) ?? new Date().toISOString().slice(0, 10),
    marchand: String(input.marchand ?? "").trim(),
    categorie:
      typeof input.categorie === "string" &&
      ["restaurant", "transport", "hebergement", "materiel", "logiciel", "autre"].includes(
        input.categorie,
      )
        ? input.categorie
        : "autre",
    description:
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null,
    numero_facture:
      typeof input.numero_facture === "string" && input.numero_facture.trim()
        ? input.numero_facture.trim()
        : null,
  };

  const parsed = OcrExpenseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

async function extractWithModel({
  openai,
  model,
  mimeType,
  base64,
  pdfText,
}: {
  openai: OpenAI;
  model: string;
  mimeType: string;
  base64: string;
  pdfText?: string;
}) {
  const isPdf = mimeType === "application/pdf";
  const userContent = isPdf && pdfText
    ? [
        { type: "text" as const, text: `Texte extrait du PDF:\n${pdfText}` },
        {
          type: "text" as const,
          text: "Utilise ce texte pour extraire les champs demandés.",
        },
      ]
    : [
        { type: "text" as const, text: "Extrait les données de ce justificatif." },
        {
          type: "image_url" as const,
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
      ];

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: OCR_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 700,
    temperature: 0,
    response_format: { type: "json_object" } as never,
  });

  return response.choices[0]?.message?.content ?? "";
}

export async function POST(request: Request) {
  if (!process.env.MAMMOUTH_API_KEY) {
    return jsonError("MAMMOUTH_API_KEY manquante", "MISSING_MAMMOUTH_API_KEY", 500);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("Aucun fichier fourni", "MISSING_FILE");
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("Fichier trop volumineux (10MB max)", "FILE_TOO_LARGE");
    }

    const mimeType = file.type || "application/octet-stream";
    const supported =
      mimeType === "application/pdf" ||
      mimeType === "image/jpeg" ||
      mimeType === "image/png" ||
      mimeType === "image/webp";

    if (!supported) {
      return jsonError("Type de fichier non supporté", "UNSUPPORTED_FILE_TYPE");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const pdfText = mimeType === "application/pdf" ? await extractPdfText(bytes) : "";

    const client = new OpenAI({
      apiKey: process.env.MAMMOUTH_API_KEY,
      baseURL: "https://api.mammouth.ai/v1",
    });

    let parsedPayload: OcrExpensePayload | null = null;
    let usedModel = "gemini-2.5-flash-lite";

    try {
      const first = await extractWithModel({
        openai: client,
        model: "gemini-2.5-flash-lite",
        mimeType,
        base64,
        pdfText,
      });
      parsedPayload = sanitizePayload(safeJsonParse(first));
    } catch {
      parsedPayload = null;
    }

    if (!parsedPayload) {
      usedModel = "claude-haiku-4-5";
      try {
        const fallback = await extractWithModel({
          openai: client,
          model: "claude-haiku-4-5",
          mimeType,
          base64,
          pdfText,
        });
        parsedPayload = sanitizePayload(safeJsonParse(fallback));
      } catch {
        parsedPayload = null;
      }
    }

    if (!parsedPayload) {
      return jsonError("Extraction OCR impossible", "OCR_PARSE_FAILED", 200);
    }

    return NextResponse.json({
      data: parsedPayload,
      confidence: estimateConfidence(parsedPayload),
      model: usedModel,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Erreur OCR",
      "OCR_INTERNAL_ERROR",
      500,
    );
  }
}
