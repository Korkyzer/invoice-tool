import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { DocumentEditor } from "@/components/invoice/DocumentEditor";
import { requireUser } from "@/lib/supabase/auth";
import { mapDocumentToFormState } from "@/lib/utils/invoice";
import type { Client, DocumentItem, DocumentLine, Profile } from "@/types";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, user } = await requireUser();

  const { data: document } = await supabase
    .from("documents")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .eq("type", "invoice")
    .maybeSingle();

  if (!document) return notFound();

  const { data: lines } = await supabase
    .from("document_lines")
    .select("*")
    .eq("document_id", document.id)
    .order("position", { ascending: true });

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
      <DocumentEditor
        type="invoice"
        documentId={document.id}
        initialState={mapDocumentToFormState(document as DocumentItem, (lines ?? []) as DocumentLine[])}
        clients={(clients ?? []) as Client[]}
        profile={(profile ?? null) as Profile | null}
      />
    </AppShell>
  );
}
