import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { qontoFetch } from "@/lib/qonto/client";
import type { QontoTransaction } from "@/types";

function toIsoDate(date: Date) {
  return date.toISOString();
}

function mapQontoTransaction(raw: Record<string, unknown>): QontoTransaction | null {
  const id = String(raw.id ?? "");
  if (!id) return null;

  const amountRaw = Number(raw.amount ?? raw.amount_cents ?? 0);
  const amount = Number.isFinite(amountRaw)
    ? Math.abs(amountRaw > 100000 ? amountRaw / 100 : amountRaw)
    : 0;
  const side = String(raw.side ?? "");

  return {
    id,
    amount,
    currency: String(raw.currency ?? "EUR"),
    side,
    emitted_at: String(raw.emitted_at ?? raw.operation_at ?? raw.created_at ?? ""),
    label: (raw.label as string | null) ?? (raw.counterparty_name as string | null) ?? null,
    status: (raw.status as string | null) ?? null,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const path = `/transactions?status=completed&updated_at_from=${encodeURIComponent(toIsoDate(from))}`;
    const result = await qontoFetch(path, { method: "GET" });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }

    const payload = result.data as { transactions?: Array<Record<string, unknown>> };
    const transactions = (payload?.transactions ?? [])
      .map((item) => mapQontoTransaction(item))
      .filter((item): item is QontoTransaction => Boolean(item))
      .filter((item) => item.side === "debit");

    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur serveur",
        code: "QONTO_TRANSACTIONS_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
