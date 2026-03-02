const QONTO_BASE_URL = "https://thirdparty.qonto.com/v2";
const RATE_LIMIT_PER_MINUTE = 60;

type RateBucket = {
  timestamps: number[];
};

const globalKey = "__qonto_rate_bucket__";

function getBucket(): RateBucket {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) {
    g[globalKey] = { timestamps: [] } satisfies RateBucket;
  }
  return g[globalKey] as RateBucket;
}

export function getQontoAuthHeader() {
  const login = process.env.QONTO_LOGIN;
  const secret = process.env.QONTO_SECRET_KEY;
  if (!login || !secret) return null;
  return `${login}:${secret}`;
}

function consumeRateToken() {
  const bucket = getBucket();
  const now = Date.now();
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60_000);
  if (bucket.timestamps.length >= RATE_LIMIT_PER_MINUTE) return false;
  bucket.timestamps.push(now);
  return true;
}

export async function qontoFetch(path: string, init?: RequestInit) {
  const authHeader = getQontoAuthHeader();
  if (!authHeader) {
    return {
      ok: false,
      status: 500,
      error: "QONTO_LOGIN ou QONTO_SECRET_KEY manquants",
      code: "QONTO_ENV_MISSING",
    };
  }

  if (!consumeRateToken()) {
    return {
      ok: false,
      status: 429,
      error: "Limite Qonto atteinte, réessaie dans une minute",
      code: "QONTO_RATE_LIMIT",
    };
  }

  try {
    const response = await fetch(`${QONTO_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        status: response.status,
        error: text || "Erreur Qonto",
        code: "QONTO_REQUEST_FAILED",
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Erreur Qonto inconnue",
      code: "QONTO_INTERNAL_ERROR",
    };
  }
}
