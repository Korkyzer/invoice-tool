"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Client } from "@/types";

export function ClientsManager({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    siret: "",
  });

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.company_name.trim()) {
      toast.error("Le nom de société est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");

      const { data, error } = await supabase
        .from("clients")
        .insert({
          user_id: user.id,
          company_name: form.company_name,
          contact_name: form.contact_name || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          siret: form.siret || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setClients((prev) => [data as Client, ...prev]);
      setForm({ company_name: "", contact_name: "", email: "", phone: "", address: "", siret: "" });
      toast.success("Client créé");
    } catch (error) {
      console.error(error);
      toast.error("Création impossible");
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (id: string) => {
    if (!window.confirm("Supprimer ce client ?")) return;

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;

      setClients((prev) => prev.filter((client) => client.id !== id));
      toast.success("Client supprimé");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Suppression impossible");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Ajouter un client</h2>
        <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={createClient}>
          <div>
            <Label>Société *</Label>
            <Input value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} required />
          </div>
          <div>
            <Label>Contact</Label>
            <Input value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </div>
          <div>
            <Label>SIRET</Label>
            <Input value={form.siret} onChange={(e) => setField("siret", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Adresse</Label>
            <Textarea value={form.address} onChange={(e) => setField("address", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : "Ajouter"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Liste des clients</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/50">
              <tr>
                <th className="px-3 py-2">Société</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Téléphone</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/clients/${client.id}`} className="text-indigo-600 hover:underline">
                      {client.company_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{client.contact_name || "-"}</td>
                  <td className="px-3 py-2">{client.email || "-"}</td>
                  <td className="px-3 py-2">{client.phone || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => deleteClient(client.id)}>
                        <Trash2 size={14} className="text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucun client pour le moment.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
