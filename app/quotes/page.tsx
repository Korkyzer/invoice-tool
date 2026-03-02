import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DocumentsTable } from "@/components/invoice/DocumentsTable";
import { requireUser, ensureProfile } from "@/lib/supabase/auth";
import type { DocumentItem, Profile } from "@/types";

export default async function QuotesPage() {
  const { supabase, user } = await requireUser();
  await ensureProfile(user.id);

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "quote")
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Devis</h1>
          <Link
            href="/quotes/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Créer un devis
          </Link>
        </div>
        <DocumentsTable
          type="quote"
          profile={(profile ?? null) as Profile | null}
          initialDocuments={(documents ?? []) as DocumentItem[]}
        />
      </div>
    </AppShell>
  );
}
