import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";

const mobileLinks = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/invoices", label: "Factures" },
  { href: "/quotes", label: "Devis" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Paramètres" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px]">
        <Sidebar />
        <main className="w-full p-4 lg:p-8">
          <nav className="mb-4 flex flex-wrap gap-2 lg:hidden">
            {mobileLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
