import { AppShell } from "@/components/layout/AppShell";
import { ClientsManager } from "@/components/clients/ClientsManager";
import { requireUser } from "@/lib/supabase/auth";
import type { Client } from "@/types";

export default async function ClientsPage() {
  const { supabase, user } = await requireUser();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Clients</h1>
        <ClientsManager initialClients={(clients ?? []) as Client[]} />
      </div>
    </AppShell>
  );
}
