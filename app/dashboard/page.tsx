import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { requireUser, ensureProfile } from "@/lib/supabase/auth";
import { markOverdueDocuments } from "@/lib/supabase/documents";
import { euro, monthIsoStart } from "@/lib/utils/invoice";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  await ensureProfile(user.id);
  await markOverdueDocuments(user.id);

  const monthStart = monthIsoStart();

  const { data: monthInvoices } = await supabase
    .from("documents")
    .select("total_ttc")
    .eq("user_id", user.id)
    .eq("type", "invoice")
    .gte("issue_date", monthStart);

  const { data: paidInvoices } = await supabase
    .from("documents")
    .select("total_ttc")
    .eq("user_id", user.id)
    .eq("type", "invoice")
    .eq("status", "paid");

  const { data: pendingInvoices } = await supabase
    .from("documents")
    .select("id,total_ttc")
    .eq("user_id", user.id)
    .eq("type", "invoice")
    .eq("status", "pending");

  const { data: overdueInvoices } = await supabase
    .from("documents")
    .select("id,total_ttc")
    .eq("user_id", user.id)
    .eq("type", "invoice")
    .eq("status", "overdue");

  const totalMonth = (monthInvoices ?? []).reduce((sum, d) => sum + Number(d.total_ttc || 0), 0);
  const totalPaid = (paidInvoices ?? []).reduce((sum, d) => sum + Number(d.total_ttc || 0), 0);
  const totalPending = (pendingInvoices ?? []).reduce((sum, d) => sum + Number(d.total_ttc || 0), 0);
  const totalOverdue = (overdueInvoices ?? []).reduce((sum, d) => sum + Number(d.total_ttc || 0), 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tableau de bord</h1>
            <p className="text-sm text-slate-500">Vue globale de votre activité de facturation</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/quotes/new"
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              Nouveau devis
            </Link>
            <Link
              href="/invoices/new"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Nouvelle facture
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total facturé ce mois</p>
            <p className="mt-2 text-2xl font-semibold">{euro(totalMonth)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total encaissé</p>
            <p className="mt-2 text-2xl font-semibold">{euro(totalPaid)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">En attente</p>
            <p className="mt-2 text-2xl font-semibold">{euro(totalPending)}</p>
            <p className="text-xs text-slate-500">{pendingInvoices?.length ?? 0} facture(s)</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">En retard</p>
            <p className="mt-2 text-2xl font-semibold text-red-600 dark:text-red-400">{euro(totalOverdue)}</p>
            <p className="text-xs text-slate-500">{overdueInvoices?.length ?? 0} facture(s)</p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
