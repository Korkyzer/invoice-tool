"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Expense, QontoTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ExpensesManagerProps {
  initialExpenses: Expense[];
}

type SuggestionMap = Record<string, QontoTransaction | undefined>;

function daysDiff(a: string, b: string) {
  const one = new Date(a).getTime();
  const two = new Date(b).getTime();
  const diff = Math.abs(one - two);
  return diff / (24 * 60 * 60 * 1000);
}

function findSuggestion(expense: Expense, transactions: QontoTransaction[]) {
  if (expense.qonto_transaction_id || Number(expense.montant_ttc) <= 0) return undefined;

  const expenseAmount = Number(expense.montant_ttc);
  const candidates = transactions.filter((tx) => {
    const amount = Number(tx.amount || 0);
    if (amount <= 0) return false;
    const amountRatio = Math.abs(amount - expenseAmount) / expenseAmount;
    const dateGap = daysDiff(expense.date, tx.emitted_at);
    return amountRatio <= 0.02 && dateGap <= 3;
  });

  if (!candidates.length) return undefined;

  return candidates.sort((a, b) => {
    const aScore =
      Math.abs(Number(a.amount || 0) - expenseAmount) / expenseAmount +
      daysDiff(expense.date, a.emitted_at) * 0.01;
    const bScore =
      Math.abs(Number(b.amount || 0) - expenseAmount) / expenseAmount +
      daysDiff(expense.date, b.emitted_at) * 0.01;
    return aScore - bScore;
  })[0];
}

function qontoStatusLabel(expense: Expense, suggestions: SuggestionMap) {
  if (expense.status === "exported") return "Exporté";
  if (expense.qonto_transaction_id) return "Lié";
  if (suggestions[expense.id]) return "Match suggéré";
  return "Non lié";
}

export function ExpensesManager({ initialExpenses }: ExpensesManagerProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [transactions, setTransactions] = useState<QontoTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [drawerExpenseId, setDrawerExpenseId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const map: SuggestionMap = {};
    for (const expense of expenses) {
      map[expense.id] = findSuggestion(expense, transactions);
    }
    return map;
  }, [expenses, transactions]);

  const drawerExpense = useMemo(
    () => expenses.find((item) => item.id === drawerExpenseId) ?? null,
    [drawerExpenseId, expenses],
  );

  useEffect(() => {
    void loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTransactions = async () => {
    if (transactions.length > 0) return;
    setLoadingTransactions(true);
    try {
      const response = await fetch("/api/qonto/transactions", { method: "GET" });
      const payload = (await response.json()) as {
        transactions?: QontoTransaction[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Erreur Qonto");
      setTransactions(payload.transactions ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement Qonto impossible");
    } finally {
      setLoadingTransactions(false);
    }
  };

  const matchExpense = async (expenseId: string, qontoTransactionId: string) => {
    setActionLoadingId(expenseId);
    try {
      const response = await fetch("/api/qonto/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: expenseId,
          qonto_transaction_id: qontoTransactionId,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Association impossible");

      setExpenses((prev) =>
        prev.map((item) =>
          item.id === expenseId
            ? { ...item, qonto_transaction_id: qontoTransactionId, status: "matched" }
            : item,
        ),
      );
      toast.success("Dépense associée à la transaction Qonto");
      setDrawerExpenseId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Association impossible");
    } finally {
      setActionLoadingId(null);
    }
  };

  const exportToQonto = async (expenseId: string) => {
    setActionLoadingId(expenseId);
    try {
      const response = await fetch("/api/qonto/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_id: expenseId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Export impossible");

      setExpenses((prev) =>
        prev.map((item) => (item.id === expenseId ? { ...item, status: "exported" } : item)),
      );
      toast.success("Justificatif exporté vers Qonto");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export impossible");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <Card>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/50">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Marchand</th>
              <th className="px-3 py-2">Montant TTC</th>
              <th className="px-3 py-2">Catégorie</th>
              <th className="px-3 py-2">Statut Qonto</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const suggestion = suggestions[expense.id];
              const canExport =
                expense.status === "matched" && Boolean(expense.qonto_transaction_id && expense.receipt_url);

              return (
                <tr key={expense.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{expense.date}</td>
                  <td className="px-3 py-2 font-medium">{expense.marchand}</td>
                  <td className="px-3 py-2">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: expense.devise || "EUR",
                    }).format(Number(expense.montant_ttc || 0))}
                  </td>
                  <td className="px-3 py-2">{expense.categorie}</td>
                  <td className="px-3 py-2">{qontoStatusLabel(expense, suggestions)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {suggestion && !expense.qonto_transaction_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === expense.id}
                          onClick={() => matchExpense(expense.id, suggestion.id)}
                        >
                          <Link2 size={14} className="mr-2" />
                          Associer suggestion
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingTransactions || actionLoadingId === expense.id}
                        onClick={async () => {
                          await loadTransactions();
                          setDrawerExpenseId(expense.id);
                        }}
                      >
                        {loadingTransactions ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Wallet size={14} className="mr-2" />}
                        Voir transactions Qonto
                      </Button>
                      <Button
                        size="sm"
                        variant="success"
                        disabled={!canExport || actionLoadingId === expense.id}
                        onClick={() => exportToQonto(expense.id)}
                      >
                        <Send size={14} className="mr-2" />
                        Exporter vers Qonto
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  Aucune note de frais
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {drawerExpense ? (
        <div className="fixed inset-0 z-40 bg-slate-900/40 p-4" onClick={() => setDrawerExpenseId(null)}>
          <div
            className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Transactions Qonto</h3>
              <Button variant="ghost" size="sm" onClick={() => setDrawerExpenseId(null)}>
                Fermer
              </Button>
            </div>

            <p className="mb-3 text-sm text-slate-500">
              Dépense: <span className="font-medium text-slate-900 dark:text-slate-100">{drawerExpense.marchand}</span> •{" "}
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: drawerExpense.devise || "EUR",
              }).format(Number(drawerExpense.montant_ttc || 0))}
            </p>

            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                >
                  <div>
                    <p className="text-sm font-medium">{tx.label || "Transaction"}</p>
                    <p className="text-xs text-slate-500">{tx.emitted_at.slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold">
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: tx.currency || "EUR",
                      }).format(Number(tx.amount || 0))}
                    </p>
                    <Button
                      size="sm"
                      disabled={actionLoadingId === drawerExpense.id}
                      onClick={() => matchExpense(drawerExpense.id, tx.id)}
                    >
                      Associer
                    </Button>
                  </div>
                </div>
              ))}
              {transactions.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune transaction Qonto trouvée.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
