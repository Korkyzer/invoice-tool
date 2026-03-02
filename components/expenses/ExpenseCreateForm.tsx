"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ExpenseCategory, ExpenseInput } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_FORM: ExpenseInput = {
  montant_ttc: 0,
  montant_ht: null,
  tva: null,
  devise: "EUR",
  date: new Date().toISOString().slice(0, 10),
  marchand: "",
  categorie: "autre",
  description: null,
  numero_facture: null,
};

type OcrResponse = {
  data?: ExpenseInput;
  confidence?: number;
  error?: string;
  code?: string;
};

const CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "restaurant", label: "Restaurant" },
  { value: "transport", label: "Transport" },
  { value: "hebergement", label: "Hébergement" },
  { value: "materiel", label: "Matériel" },
  { value: "logiciel", label: "Logiciel" },
  { value: "autre", label: "Autre" },
];

function numberFromInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ExpenseCreateForm() {
  const [form, setForm] = useState<ExpenseInput>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasMandatoryFields = useMemo(
    () => form.montant_ttc > 0 && form.date && form.marchand.trim().length > 0,
    [form.date, form.marchand, form.montant_ttc],
  );

  const setField = <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateFile = (next: File | null) => {
    if (!next) return;
    if (next.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (10MB max)");
      return;
    }
    setFile(next);
  };

  const runOcr = async () => {
    if (!file) {
      toast.error("Ajoute un fichier avant l'OCR");
      return;
    }

    setOcrLoading(true);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch("/api/expenses/ocr", {
        method: "POST",
        body: payload,
      });

      const result = (await response.json()) as OcrResponse;
      if (!response.ok || !result.data) {
        const message = result.error || "Extraction OCR impossible";
        toast.error(message);
        setLastConfidence(null);
        return;
      }

      setForm(result.data);
      setLastConfidence(typeof result.confidence === "number" ? result.confidence : null);
      toast.success("OCR terminé, formulaire pré-rempli");
    } catch {
      toast.error("OCR indisponible, tu peux saisir manuellement");
      setLastConfidence(null);
    } finally {
      setOcrLoading(false);
    }
  };

  const saveExpense = async () => {
    if (!hasMandatoryFields) {
      toast.error("Montant TTC, date et marchand sont obligatoires");
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      let receiptUrl: string | null = null;
      if (file) {
        const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}-${fileName}`;
        const { data: uploaded, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        receiptUrl = uploaded.path;
      }

      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        montant_ttc: form.montant_ttc,
        montant_ht: form.montant_ht,
        tva: form.tva,
        devise: form.devise || "EUR",
        date: form.date,
        marchand: form.marchand.trim(),
        categorie: form.categorie,
        description: form.description || null,
        numero_facture: form.numero_facture || null,
        receipt_url: receiptUrl,
        status: "pending_review",
      });

      if (error) throw error;

      toast.success("Dépense enregistrée (pending_review)");
      setForm(EMPTY_FORM);
      setFile(null);
      setLastConfidence(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enregistrement impossible";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Justificatif</h2>
          <p className="text-sm text-slate-500">
            Image (JPEG/PNG/WEBP) ou PDF, max 10MB. OCR via Mammouth AI.
          </p>
        </div>

        <div
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0] ?? null;
            updateFile(dropped);
          }}
        >
          <UploadCloud className="mx-auto mb-2 text-slate-500" size={22} />
          <p className="text-sm">{file ? file.name : "Glisse ton reçu ici ou sélectionne un fichier"}</p>
          <div className="mt-3 flex justify-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => updateFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              Choisir un fichier
            </Button>
            <Button type="button" onClick={runOcr} disabled={!file || ocrLoading}>
              {ocrLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              Lancer OCR
            </Button>
          </div>
          {lastConfidence !== null ? (
            <p className="mt-2 text-xs text-slate-500">
              Confiance estimée: {Math.round(lastConfidence * 100)}%
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Données de la dépense</h2>
          <p className="text-sm text-slate-500">Tu peux ajuster les champs avant validation.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Montant TTC (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.montant_ttc}
              onChange={(e) => setField("montant_ttc", numberFromInput(e.target.value))}
            />
          </div>
          <div>
            <Label>Montant HT (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.montant_ht ?? ""}
              onChange={(e) => setField("montant_ht", e.target.value ? numberFromInput(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>TVA (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.tva ?? ""}
              onChange={(e) => setField("tva", e.target.value ? numberFromInput(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Devise</Label>
            <Input value={form.devise} onChange={(e) => setField("devise", e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
          </div>
          <div>
            <Label>Marchand</Label>
            <Input value={form.marchand} onChange={(e) => setField("marchand", e.target.value)} />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select
              value={form.categorie}
              onChange={(e) => setField("categorie", e.target.value as ExpenseCategory)}
            >
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Numéro de facture</Label>
            <Input
              value={form.numero_facture ?? ""}
              onChange={(e) => setField("numero_facture", e.target.value || null)}
            />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setField("description", e.target.value || null)}
            placeholder="Notes complémentaires"
          />
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={saveExpense} disabled={saving}>
            {saving ? "Enregistrement..." : "Valider"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
