import { cn } from "@/lib/utils";

export function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <label className={cn("mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>{children}</label>;
}
