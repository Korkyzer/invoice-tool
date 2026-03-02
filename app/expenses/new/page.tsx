import { AppShell } from "@/components/layout/AppShell";
import { ExpenseCreateForm } from "@/components/expenses/ExpenseCreateForm";
import { requireUser } from "@/lib/supabase/auth";

export default async function NewExpensePage() {
  await requireUser();

  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Nouvelle note de frais</h1>
        <ExpenseCreateForm />
      </div>
    </AppShell>
  );
}
