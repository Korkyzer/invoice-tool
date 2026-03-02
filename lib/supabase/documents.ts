import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function markOverdueDocuments(userId: string) {
  const supabase = getSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("documents")
    .update({ status: "overdue" })
    .eq("user_id", userId)
    .eq("type", "invoice")
    .eq("status", "pending")
    .lt("due_date", today);
}
