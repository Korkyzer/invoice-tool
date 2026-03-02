"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FileCheck2,
  Users,
  Settings,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/invoices", label: "Factures", icon: FileText },
  { href: "/quotes", label: "Devis", icon: FileCheck2 },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="hidden min-h-screen w-64 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:flex lg:flex-col">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Gestion</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">Factures & Devis</h1>
      </div>

      <nav className="mt-8 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon size={16} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          <span className="ml-2">{theme === "dark" ? "Mode clair" : "Mode sombre"}</span>
        </Button>
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut size={16} />
          <span className="ml-2">Se déconnecter</span>
        </Button>
      </div>
    </aside>
  );
}
