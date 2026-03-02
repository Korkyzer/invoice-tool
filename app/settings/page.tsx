import { AppShell } from "@/components/layout/AppShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUser, ensureProfile } from "@/lib/supabase/auth";
import type { Profile } from "@/types";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  await ensureProfile(user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <SettingsForm profile={(profile ?? null) as Profile | null} />
      </div>
    </AppShell>
  );
}
