"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, FileDown, Save, Wand2 } from "lucide-react";
import { AIAssistant } from "@/components/invoice/AIAssistant";
import { InvoicePreview } from "@/components/invoice/InvoicePreview";
import { LineItemsTable } from "@/components/invoice/LineItemsTable";
import { StatusBadge } from "@/components/invoice/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { downloadInvoicePdf } from "@/lib/pdf/generate";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildInitialFormState,
  calculateTotals,
  defaultDueDate,
  defaultIssueDate,
  euro,
  mapClientToSnapshot,
} from "@/lib/utils/invoice";
import type {
  Client,
  DocumentLine,
  DocumentStatus,
  DocumentType,
  InvoiceAssistantPatch,
  InvoiceFormState,
  Profile,
  VatRate,
} from "@/types";

interface DocumentEditorProps {
  type: DocumentType;
  documentId?: string;
  initialState?: InvoiceFormState;
  clients: Client[];
  profile: Profile | null;
}

const INVOICE_STATUSES: DocumentStatus[] = ["draft", "sent", "pending", "paid", "overdue"];
const QUOTE_STATUSES: DocumentStatus[] = ["draft", "sent", "accepted", "refused"];

async function getNextNumber(type: DocumentType, date: string, accessToken?: string) {
  const year = Number((date || defaultIssueDate()).slice(0, 4));
  const response = await fetch("/api/documents/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ type, year }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; details?: string }
      | null;
    throw new Error(payload?.details || payload?.error || "number_error");
  }
  const data = (await response.json()) as { number: string };
  return data.number;
}

function buildDraftNumber(type: DocumentType) {
  const prefix = type === "invoice" ? "BROUILLON-FAC" : "BROUILLON-DEV";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${stamp}-${random}`;
}

function isTemporaryDraftNumber(value?: string) {
  return Boolean(value && value.startsWith("BROUILLON-"));
}

export function DocumentEditor({
  type,
  documentId,
  initialState,
  clients,
  profile,
}: DocumentEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [state, setState] = useState<InvoiceFormState>(() =>
    initialState
      ? initialState
      : buildInitialFormState(type, {
          payment_terms: profile?.default_payment_terms ?? "Paiement à réception de facture",
          issue_date: defaultIssueDate(),
          due_date: type === "invoice" ? defaultDueDate(30) : "",
          lines: [
            {
              description: "",
              quantity: 1,
              unit_price: 0,
              vat_rate: (profile?.default_vat_rate as VatRate) || 20,
              position: 0,
            },
          ],
        }),
  );

  const totals = useMemo(
    () => calculateTotals(state.lines, state.discount_type, Number(state.discount_value || 0)),
    [state.discount_type, state.discount_value, state.lines],
  );

  const statusOptions = type === "invoice" ? INVOICE_STATUSES : QUOTE_STATUSES;
  const paymentBadgeLabel =
    state.payment_status === "paid"
      ? "Payée"
      : state.stripe_payment_link_url
        ? "Non payée"
        : "Lien non créé";

  const toLine = (
    line: Partial<DocumentLine>,
    fallback: DocumentLine | undefined,
    position: number,
  ): DocumentLine => {
    const quantity = Number(line.quantity ?? fallback?.quantity ?? 1);
    const unitPrice = Number(line.unit_price ?? fallback?.unit_price ?? 0);
    const vatRate = Number(line.vat_rate ?? fallback?.vat_rate ?? 20);

    return {
      description:
        typeof line.description === "string"
          ? line.description
          : fallback?.description ?? "",
      quantity: Number.isFinite(quantity) ? quantity : Number(fallback?.quantity ?? 1),
      unit_price: Number.isFinite(unitPrice) ? unitPrice : Number(fallback?.unit_price ?? 0),
      vat_rate: (Number.isFinite(vatRate) ? vatRate : Number(fallback?.vat_rate ?? 20)) as VatRate,
      position,
    };
  };

  const toInteger = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
  };

  const applyPatch = (patch: InvoiceAssistantPatch) => {
    setState((prev) => {
      const next = { ...prev };
      if (patch.client) next.client = { ...prev.client, ...patch.client };

      let patchedLines = prev.lines.map((line, index) => ({ ...line, position: index }));

      if (patch.line_updates && Array.isArray(patch.line_updates)) {
        for (const update of patch.line_updates) {
          const fromLineNumber = toInteger(update.line_number);
          const fromIndex = toInteger(update.index);
          const targetIndex =
            fromLineNumber !== null
              ? fromLineNumber - 1
              : fromIndex !== null
                ? fromIndex > 0
                  ? fromIndex - 1
                  : fromIndex
                : -1;

          if (targetIndex < 0 || targetIndex >= patchedLines.length) continue;
          patchedLines[targetIndex] = toLine(update, patchedLines[targetIndex], targetIndex);
        }
      }

      if (patch.line_append && Array.isArray(patch.line_append)) {
        for (const appended of patch.line_append) {
          patchedLines.push(toLine(appended, undefined, patchedLines.length));
        }
      }

      if (patch.line_delete_indices && Array.isArray(patch.line_delete_indices)) {
        const indexesToDelete = new Set<number>();
        for (const rawIndex of patch.line_delete_indices) {
          const normalized = toInteger(rawIndex);
          if (normalized === null) continue;
          const zeroBased = normalized > 0 ? normalized - 1 : normalized;
          if (zeroBased >= 0 && zeroBased < patchedLines.length) {
            indexesToDelete.add(zeroBased);
          }
        }
        patchedLines = patchedLines.filter((_, index) => !indexesToDelete.has(index));
      }

      if (patch.lines && Array.isArray(patch.lines)) {
        patchedLines = patch.lines.map((line, index) => toLine(line, prev.lines[index], index));
      }

      if (patchedLines.length === 0) {
        patchedLines = [
          {
            description: "",
            quantity: 1,
            unit_price: 0,
            vat_rate: 20,
            position: 0,
          },
        ];
      }

      next.lines = patchedLines.map((line, index) => ({ ...line, position: index }));
      if (patch.issue_date) next.issue_date = patch.issue_date;
      if (patch.due_date) next.due_date = patch.due_date;
      if (typeof patch.notes === "string") next.notes = patch.notes;
      if (typeof patch.payment_terms === "string") next.payment_terms = patch.payment_terms;
      return next;
    });
  };

  const setField = <K extends keyof InvoiceFormState>(key: K, value: InvoiceFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const setClientId = (id: string) => {
    const selected = clients.find((c) => c.id === id) ?? null;
    setState((prev) => ({
      ...prev,
      client_id: selected?.id ?? null,
      client: selected ? mapClientToSnapshot(selected) : prev.client,
    }));
  };

  const persistDocument = async (options?: { forceDraft?: boolean }) => {
    setSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!user) {
        toast.error("Vous devez être connecté");
        router.push("/login");
        return;
      }

      const shouldAllocateOfficialNumber =
        !state.number || (!options?.forceDraft && isTemporaryDraftNumber(state.number));

      let number = state.number;
      if (shouldAllocateOfficialNumber) {
        if (options?.forceDraft && !state.number) {
          try {
            number = await getNextNumber(
              type,
              state.issue_date || defaultIssueDate(),
              session?.access_token,
            );
          } catch {
            number = buildDraftNumber(type);
          }
        } else {
          number = await getNextNumber(
            type,
            state.issue_date || defaultIssueDate(),
            session?.access_token,
          );
        }
      }

      const effectiveStatus: DocumentStatus = options?.forceDraft ? "draft" : state.status;

      const docPayload = {
        user_id: user.id,
        type,
        number,
        status: effectiveStatus,
        client_id: state.client_id,
        client_snapshot: state.client,
        issue_date: state.issue_date || defaultIssueDate(),
        due_date: state.due_date || null,
        payment_date: effectiveStatus === "paid" ? state.payment_date || null : null,
        subtotal_ht: totals.subtotalHt,
        total_tva: totals.totalVat,
        total_ttc: totals.totalTtc,
        notes: state.notes || null,
        payment_terms: state.payment_terms || null,
        discount_type: state.discount_type === "none" ? null : state.discount_type,
        discount_value: Number(state.discount_value || 0),
      };

      let currentId = documentId;

      if (currentId) {
        const { error: updateError } = await supabase
          .from("documents")
          .update(docPayload)
          .eq("id", currentId)
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        const { error: deleteError } = await supabase
          .from("document_lines")
          .delete()
          .eq("document_id", currentId);

        if (deleteError) throw deleteError;
      } else {
        const { data, error: insertError } = await supabase
          .from("documents")
          .insert(docPayload)
          .select("id")
          .single();

        if (insertError) throw insertError;
        currentId = data.id;
      }

      const linesPayload = state.lines.map((line, index) => ({
        document_id: currentId,
        description: line.description || "Ligne",
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        vat_rate: Number(line.vat_rate || 0),
        position: index,
      }));

      if (linesPayload.length > 0) {
        const { error: linesError } = await supabase.from("document_lines").insert(linesPayload);
        if (linesError) throw linesError;
      }

      setState((prev) => ({ ...prev, number, status: effectiveStatus }));
      if (options?.forceDraft) {
        toast.success("Brouillon ajouté");
      } else {
        toast.success(type === "invoice" ? "Facture enregistrée" : "Devis enregistré");
      }

      if (!documentId && currentId) {
        router.replace(`/${type === "invoice" ? "invoices" : "quotes"}/${currentId}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Impossible d'enregistrer le document";
      toast.error(`Impossible d'enregistrer le document (${message})`);
    } finally {
      setSaving(false);
    }
  };

  const convertToInvoice = async () => {
    if (type !== "quote") return;

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!user) throw new Error("not_authenticated");

      const number = await getNextNumber(
        "invoice",
        state.issue_date || defaultIssueDate(),
        session?.access_token,
      );

      const { data: invoice, error } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          type: "invoice",
          number,
          status: "draft",
          client_id: state.client_id,
          client_snapshot: state.client,
          issue_date: state.issue_date || defaultIssueDate(),
          due_date: state.due_date || defaultDueDate(),
          subtotal_ht: totals.subtotalHt,
          total_tva: totals.totalVat,
          total_ttc: totals.totalTtc,
          notes: state.notes || null,
          payment_terms: state.payment_terms || null,
          discount_type: state.discount_type === "none" ? null : state.discount_type,
          discount_value: Number(state.discount_value || 0),
          converted_from_id: documentId ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;

      const linesPayload = state.lines.map((line, index) => ({
        document_id: invoice.id,
        description: line.description || "Ligne",
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        vat_rate: Number(line.vat_rate || 0),
        position: index,
      }));

      if (linesPayload.length) {
        const { error: linesError } = await supabase.from("document_lines").insert(linesPayload);
        if (linesError) throw linesError;
      }

      toast.success("Devis converti en facture");
      router.push(`/invoices/${invoice.id}`);
    } catch (error) {
      console.error(error);
      toast.error("Conversion impossible");
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    try {
      const company = (state.client.company_name || "client").replace(/[^a-z0-9]/gi, "-");
      const filename = `${state.number || `${type === "invoice" ? "FAC" : "DEV"}-${new Date().getFullYear()}-0001`}-${company}.pdf`;
      await downloadInvoicePdf({
        profile,
        document: state,
        totals,
        fileName: filename,
      });
    } catch (error) {
      console.error(error);
      toast.error("Impossible de générer le PDF");
    }
  };

  const generatePaymentLink = async () => {
    if (type !== "invoice") return;
    if (!documentId) {
      toast.error("Enregistre d'abord la facture avant de générer un lien");
      return;
    }
    if (state.stripe_payment_link_url) {
      toast.success("Lien de paiement déjà créé");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${documentId}/payment-link`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        id?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url || !payload.id) {
        throw new Error(payload.error || "Création du lien impossible");
      }

      setState((prev) => ({
        ...prev,
        stripe_payment_link_id: payload.id ?? null,
        stripe_payment_link_url: payload.url ?? null,
        payment_status: "unpaid",
      }));
      toast.success("Lien de paiement Stripe généré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création du lien impossible");
    } finally {
      setSaving(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!state.stripe_payment_link_url) return;
    try {
      await navigator.clipboard.writeText(state.stripe_payment_link_url);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const statuses = statusOptions;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{type === "invoice" ? "Facture" : "Devis"}</h1>
          <StatusBadge status={state.status} />
          {state.number ? <span className="text-sm text-slate-500">{state.number}</span> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {!documentId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => persistDocument({ forceDraft: true })}
              disabled={saving}
            >
              Enregistrer comme brouillon
            </Button>
          ) : null}
          {type === "quote" && documentId ? (
            <Button type="button" variant="outline" onClick={convertToInvoice} disabled={saving}>
              Convertir en facture
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={downloadPdf}>
            <FileDown size={14} className="mr-2" />
            Télécharger PDF
          </Button>
          <Button type="button" onClick={() => persistDocument()} disabled={saving}>
            <Save size={14} className="mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      {type === "invoice" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${
              state.payment_status === "paid"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                : state.stripe_payment_link_url
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {paymentBadgeLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={generatePaymentLink}
            disabled={saving || Boolean(state.stripe_payment_link_url) || !documentId}
          >
            Générer lien de paiement
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={copyPaymentLink}
            disabled={!state.stripe_payment_link_url}
          >
            <Copy size={14} className="mr-2" />
            Copier
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!state.stripe_payment_link_url}
            onClick={() => {
              if (!state.stripe_payment_link_url) return;
              window.open(state.stripe_payment_link_url, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink size={14} className="mr-2" />
            Ouvrir
          </Button>
          {state.stripe_payment_link_url ? (
            <a
              href={state.stripe_payment_link_url}
              target="_blank"
              rel="noreferrer"
              className="ml-2 max-w-full truncate text-xs text-indigo-600 hover:underline"
            >
              {state.stripe_payment_link_url}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <InvoicePreview document={state} totals={totals} profile={profile} />
        </div>

        <div className="lg:col-span-4 lg:sticky lg:top-4 lg:h-fit">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium">Assistant IA / Formulaire</p>
            <Button variant="ghost" size="sm" onClick={() => setAiMode((v) => !v)}>
              <Wand2 size={14} className="mr-2" />
              {aiMode ? "Passer en mode formulaire" : "Passer en mode IA"}
            </Button>
          </div>

          {aiMode ? (
            <AIAssistant state={state} onPatch={applyPatch} />
          ) : (
            <Card className="space-y-4">
              <div>
                <Label>Client existant</Label>
                <Select
                  value={state.client_id ?? ""}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Société cliente</Label>
                  <Input
                    value={state.client.company_name ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, company_name: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Contact</Label>
                  <Input
                    value={state.client.contact_name ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, contact_name: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={state.client.email ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, email: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>SIRET</Label>
                  <Input
                    value={state.client.siret ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, siret: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Téléphone</Label>
                  <Input
                    value={state.client.phone ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, phone: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>TVA client</Label>
                  <Input
                    value={state.client.tva_number ?? ""}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        client: { ...prev.client, tva_number: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Site web client</Label>
                <Input
                  value={state.client.website ?? ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      client: { ...prev.client, website: e.target.value },
                    }))
                  }
                />
              </div>

              <div>
                <Label>Adresse client</Label>
                <Textarea
                  value={state.client.address ?? ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      client: { ...prev.client, address: e.target.value },
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date d&apos;émission</Label>
                  <Input
                    type="date"
                    value={state.issue_date}
                    onChange={(e) => setField("issue_date", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Date d&apos;échéance</Label>
                  <Input
                    type="date"
                    value={state.due_date}
                    onChange={(e) => setField("due_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Statut</Label>
                  <Select
                    value={state.status}
                    onChange={(e) => setField("status", e.target.value as DocumentStatus)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>
                {state.status === "paid" ? (
                  <div>
                    <Label>Date de paiement</Label>
                    <Input
                      type="date"
                      value={state.payment_date}
                      onChange={(e) => setField("payment_date", e.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Remise</Label>
                  <Select
                    value={state.discount_type}
                    onChange={(e) =>
                      setField("discount_type", e.target.value as InvoiceFormState["discount_type"])
                    }
                  >
                    <option value="none">Aucune</option>
                    <option value="percent">Pourcentage</option>
                    <option value="fixed">Montant fixe</option>
                  </Select>
                </div>
                <div>
                  <Label>Valeur remise</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.discount_value}
                    onChange={(e) => setField("discount_value", Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <Label>Conditions de paiement</Label>
                <Textarea
                  value={state.payment_terms}
                  onChange={(e) => setField("payment_terms", e.target.value)}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={state.notes} onChange={(e) => setField("notes", e.target.value)} />
              </div>

              <LineItemsTable
                lines={state.lines}
                onChange={(lines) => setField("lines", lines as DocumentLine[])}
              />

              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p>Total HT: {euro(totals.subtotalHt)}</p>
                <p>TVA: {euro(totals.totalVat)}</p>
                <p className="font-semibold">Total TTC: {euro(totals.totalTtc)}</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
