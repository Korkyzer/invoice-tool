import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  expense_id: z.string().uuid(),
  qonto_transaction_id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload invalide", code: "INVALID_PAYLOAD" }, { status: 400 });
    }

    const { error } = await supabase
      .from("expenses")
      .update({
        qonto_transaction_id: parsed.data.qonto_transaction_id,
        status: "matched",
      })
      .eq("id", parsed.data.expense_id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message, code: "EXPENSE_MATCH_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur serveur",
        code: "QONTO_MATCH_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
