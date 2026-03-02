import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { qontoFetch } from "@/lib/qonto/client";

const schema = z.object({
  expense_id: z.string().uuid(),
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

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("id, receipt_url, qonto_transaction_id, status")
      .eq("id", parsed.data.expense_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (expenseError || !expense) {
      return NextResponse.json({ error: "Dépense introuvable", code: "EXPENSE_NOT_FOUND" }, { status: 404 });
    }

    if (!expense.receipt_url) {
      return NextResponse.json({ error: "Aucun justificatif à exporter", code: "RECEIPT_MISSING" }, { status: 400 });
    }

    if (!expense.qonto_transaction_id) {
      return NextResponse.json({ error: "Transaction Qonto non associée", code: "QONTO_TRANSACTION_MISSING" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: file, error: downloadError } = await admin.storage
      .from("receipts")
      .download(expense.receipt_url);

    if (downloadError || !file) {
      return NextResponse.json(
        { error: downloadError?.message || "Téléchargement justificatif impossible", code: "RECEIPT_DOWNLOAD_FAILED" },
        { status: 500 },
      );
    }

    const bytes = await file.arrayBuffer();
    const fileName = expense.receipt_url.split("/").pop() || "receipt.pdf";
    const formData = new FormData();
    formData.append("transaction_id", expense.qonto_transaction_id);
    formData.append("file", new Blob([bytes], { type: file.type || "application/octet-stream" }), fileName);

    const uploadResult = await qontoFetch("/attachments", {
      method: "POST",
      body: formData,
    });

    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error, code: uploadResult.code }, { status: uploadResult.status });
    }

    const { error: updateError } = await supabase
      .from("expenses")
      .update({ status: "exported" })
      .eq("id", parsed.data.expense_id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message, code: "EXPENSE_STATUS_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur serveur",
        code: "QONTO_ATTACH_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
