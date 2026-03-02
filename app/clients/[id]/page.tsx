import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/invoice/StatusBadge";
import { requireUser } from "@/lib/supabase/auth";
import { euro } from "@/lib/utils/invoice";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!client) return notFound();

  const { data: documents } = await supabase
    .from("documents")
    .select("id, type, number, status, total_ttc, issue_date")
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const totalFacture = (documents ?? [])
    .filter((doc) => doc.type === "invoice")
    .reduce((sum, doc) => sum + Number(doc.total_ttc || 0), 0);

  const totalEncaisse = (documents ?? [])
    .filter((doc) => doc.type === "invoice" && doc.status === "paid")
    .reduce((sum, doc) => sum + Number(doc.total_ttc || 0), 0);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{client.company_name}</h1>
            <p className="text-sm text-slate-500">{client.contact_name || "Aucun contact"}</p>
          </div>
          <Link
            href="/clients"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Retour
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total facturé</p>
            <p className="mt-2 text-2xl font-semibold">{euro(totalFacture)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total encaissé</p>
            <p className="mt-2 text-2xl font-semibold">{euro(totalEncaisse)}</p>
          </Card>
        </div>

        <Card>
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Numéro</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {(documents ?? []).map((doc) => (
                  <tr key={doc.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{doc.type === "invoice" ? "Facture" : "Devis"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/${doc.type === "invoice" ? "invoices" : "quotes"}/${doc.id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {doc.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{doc.issue_date}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-3 py-2 text-right">{euro(Number(doc.total_ttc || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
