import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/utils/invoice";
import type { DocumentStatus } from "@/types";

const statusClass: Record<DocumentStatus, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  refused: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        statusClass[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
