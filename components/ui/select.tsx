import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-indigo-200 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
