import { AppShell } from "@/components/layout/AppShell";
import { DocumentEditor } from "@/components/invoice/DocumentEditor";
import { requireUser, ensureProfile } from "@/lib/supabase/auth";
import type { Client, Profile } from "@/types";

export default async function NewQuotePage() {
  const { supabase, user } = await requireUser();
  await ensureProfile(user.id);

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .order("company_name", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell>
      <DocumentEditor type="quote" clients={(clients ?? []) as Client[]} profile={(profile ?? null) as Profile | null} />
    </AppShell>
  );
}
