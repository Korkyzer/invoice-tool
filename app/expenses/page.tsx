import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ExpensesManager } from "@/components/expenses/ExpensesManager";
import { requireUser } from "@/lib/supabase/auth";
import type { Expense } from "@/types";

export default async function ExpensesPage() {
  const { supabase, user } = await requireUser();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Notes de frais</h1>
          <Link
            href="/expenses/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Nouvelle note de frais
          </Link>
        </div>

        <ExpensesManager initialExpenses={(expenses ?? []) as Expense[]} />
      </div>
    </AppShell>
  );
}
