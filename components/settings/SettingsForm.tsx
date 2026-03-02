"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_LEGAL_MENTION_NO_VAT } from "@/lib/utils/invoice";
import type { Profile } from "@/types";

interface SettingsFormProps {
  profile: Profile | null;
}

export function SettingsForm({ profile }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    company_name: profile?.company_name ?? "",
    siret: profile?.siret ?? "",
    tva_number: profile?.tva_number ?? "",
    address: profile?.address ?? "",
    iban: profile?.iban ?? "",
    email: profile?.email ?? "",
    logo_url: profile?.logo_url ?? "",
    default_payment_terms: profile?.default_payment_terms ?? "Paiement à réception de facture",
    default_vat_rate: Number(profile?.default_vat_rate ?? 20),
    is_micro_entrepreneur: profile?.is_micro_entrepreneur ?? false,
    auto_legal_mention_no_vat: profile?.auto_legal_mention_no_vat ?? true,
    legal_mention_no_vat: profile?.legal_mention_no_vat ?? DEFAULT_LEGAL_MENTION_NO_VAT,
    invoice_prefix: profile?.invoice_prefix ?? "FAC",
    quote_prefix: profile?.quote_prefix ?? "DEV",
    invoice_next_number: Number(profile?.invoice_next_number ?? 1),
    quote_next_number: Number(profile?.quote_next_number ?? 1),
  });

  const setField = (key: keyof typeof form, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");

      const filePath = `${user.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from("logos").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
      setField("logo_url", data.publicUrl);
      toast.success("Logo envoyé");
    } catch (error) {
      console.error(error);
      toast.error("Upload logo impossible. Vérifiez le bucket `logos`.");
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");

      const { error } = await supabase.from("profiles").upsert({
        user_id: user.id,
        ...form,
      });
      if (error) throw error;

      toast.success("Paramètres enregistrés");
    } catch (error) {
      console.error(error);
      toast.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={save}>
      <Card>
        <h2 className="text-lg font-semibold">Profil vendeur</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Nom / Société</Label>
            <Input value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </div>
          <div>
            <Label>SIRET</Label>
            <Input value={form.siret} onChange={(e) => setField("siret", e.target.value)} />
          </div>
          <div>
            <Label>N° TVA intracom.</Label>
            <Input value={form.tva_number} onChange={(e) => setField("tva_number", e.target.value)} />
          </div>
          <div>
            <Label>IBAN</Label>
            <Input value={form.iban} onChange={(e) => setField("iban", e.target.value)} />
          </div>
          <div>
            <Label>Logo</Label>
            <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            {uploading ? <p className="mt-1 text-xs text-slate-500">Upload en cours...</p> : null}
            {form.logo_url ? <p className="mt-1 text-xs text-slate-500">Logo configuré</p> : null}
          </div>
          <div className="md:col-span-2">
            <Label>Adresse</Label>
            <Textarea value={form.address} onChange={(e) => setField("address", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Facturation par défaut</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Conditions de paiement</Label>
            <Textarea
              value={form.default_payment_terms}
              onChange={(e) => setField("default_payment_terms", e.target.value)}
            />
          </div>
          <div>
            <Label>TVA par défaut (%)</Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={form.default_vat_rate}
              onChange={(e) => setField("default_vat_rate", Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_micro_entrepreneur}
                onChange={(e) => setField("is_micro_entrepreneur", e.target.checked)}
                className="size-4 rounded border-slate-300 text-indigo-600"
              />
              Je suis en micro-entreprise (franchise en base de TVA)
            </label>
          </div>
          {form.is_micro_entrepreneur ? (
            <>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.auto_legal_mention_no_vat}
                    onChange={(e) => setField("auto_legal_mention_no_vat", e.target.checked)}
                    className="size-4 rounded border-slate-300 text-indigo-600"
                  />
                  Ajouter automatiquement la mention légale quand la TVA est à 0
                </label>
              </div>
              <div className="md:col-span-2">
                <Label>Mention légale (auto)</Label>
                <Textarea
                  value={form.legal_mention_no_vat}
                  onChange={(e) => setField("legal_mention_no_vat", e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Préfixes et compteur</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Préfixe factures</Label>
            <Input value={form.invoice_prefix} onChange={(e) => setField("invoice_prefix", e.target.value)} />
          </div>
          <div>
            <Label>Prochain n° facture</Label>
            <Input
              type="number"
              min="1"
              value={form.invoice_next_number}
              onChange={(e) => setField("invoice_next_number", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Préfixe devis</Label>
            <Input value={form.quote_prefix} onChange={(e) => setField("quote_prefix", e.target.value)} />
          </div>
          <div>
            <Label>Prochain n° devis</Label>
            <Input
              type="number"
              min="1"
              value={form.quote_next_number}
              onChange={(e) => setField("quote_next_number", Number(e.target.value))}
            />
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer les paramètres"}
      </Button>
    </form>
  );
}
