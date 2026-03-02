"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { downloadInvoicePdf } from "@/lib/pdf/generate";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateTotals,
  compareForSort,
  euro,
  mapDocumentToFormState,
  typeLabel,
} from "@/lib/utils/invoice";
import type {
  DocumentItem,
  DocumentLine,
  DocumentStatus,
  DocumentType,
  Profile,
  VatRate,
} from "@/types";
import { StatusBadge } from "@/components/invoice/StatusBadge";

interface DocumentsTableProps {
  type: DocumentType;
  profile: Profile | null;
  initialDocuments: DocumentItem[];
}

interface RawLine {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  position: number;
}

async function getNextNumber(type: DocumentType, issueDate: string, accessToken?: string) {
  const response = await fetch("/api/documents/number", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ type, year: Number(issueDate.slice(0, 4)) }),
  });

  if (!response.ok) throw new Error("number_error");
  const data = (await response.json()) as { number: string };
  return data.number;
}

export function DocumentsTable({ type, profile, initialDocuments }: DocumentsTableProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [sortKey, setSortKey] = useState<"number" | "created_at" | "total_ttc" | "status">(
    "created_at",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(
    () => compareForSort(documents, sortKey, sortDirection),
    [documents, sortDirection, sortKey],
  );

  const updateStatus = async (docId: string, status: DocumentStatus) => {
    try {
      const supabase = getSupabaseBrowserClient();
      const payload: { status: DocumentStatus; payment_date?: string | null } = { status };
      if (status === "paid") payload.payment_date = new Date().toISOString().slice(0, 10);

      const { error } = await supabase.from("documents").update(payload).eq("id", docId);
      if (error) throw error;

      setDocuments((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, ...payload } : doc)));
      toast.success("Statut mis à jour");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Impossible de changer le statut");
    }
  };

  const deleteDocument = async (docId: string) => {
    if (!window.confirm("Supprimer ce document ?")) return;

    setLoadingId(docId);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("documents").delete().eq("id", docId);
      if (error) throw error;

      setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
      toast.success("Document supprimé");
    } catch (error) {
      console.error(error);
      toast.error("Suppression impossible");
    } finally {
      setLoadingId(null);
    }
  };

  const duplicateDocument = async (doc: DocumentItem) => {
    setLoadingId(doc.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const number = await getNextNumber(type, doc.issue_date, session?.access_token);

      const { data: copy, error: insertError } = await supabase
        .from("documents")
        .insert({
          number,
          status: "draft",
          user_id: doc.user_id,
          type: doc.type,
          client_id: doc.client_id,
          client_snapshot: doc.client_snapshot,
          issue_date: doc.issue_date,
          due_date: doc.due_date,
          payment_date: null,
          subtotal_ht: doc.subtotal_ht,
          total_tva: doc.total_tva,
          total_ttc: doc.total_ttc,
          notes: doc.notes,
          payment_terms: doc.payment_terms,
          discount_type: doc.discount_type,
          discount_value: doc.discount_value,
          converted_from_id: doc.converted_from_id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const { data: lines, error: linesError } = await supabase
        .from("document_lines")
        .select("description, quantity, unit_price, vat_rate, position")
        .eq("document_id", doc.id);
      if (linesError) throw linesError;

      if (lines?.length) {
        const { error: insertLinesError } = await supabase.from("document_lines").insert(
          (lines as RawLine[]).map((line) => ({
            document_id: copy.id,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            vat_rate: line.vat_rate,
            position: line.position,
          })),
        );
        if (insertLinesError) throw insertLinesError;
      }

      toast.success("Document dupliqué");
      router.push(`/${type === "invoice" ? "invoices" : "quotes"}/${copy.id}`);
    } catch (error) {
      console.error(error);
      toast.error("Duplication impossible");
    } finally {
      setLoadingId(null);
    }
  };

  const quickPdf = async (doc: DocumentItem) => {
    setLoadingId(doc.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: lines, error } = await supabase
        .from("document_lines")
        .select("description, quantity, unit_price, vat_rate, position")
        .eq("document_id", doc.id)
        .order("position", { ascending: true });
      if (error) throw error;

      const normalizedLines: DocumentLine[] = ((lines ?? []) as RawLine[]).map((line, index) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        vat_rate: Number(line.vat_rate) as VatRate,
        position: Number(line.position ?? index),
      }));

      const formState = mapDocumentToFormState(doc, normalizedLines);
      const totals = calculateTotals(
        formState.lines,
        formState.discount_type,
        Number(formState.discount_value || 0),
      );

      const company = (doc.client_snapshot?.company_name || "client").replace(/[^a-z0-9]/gi, "-");
      await downloadInvoicePdf({
        profile,
        document: formState,
        totals,
        fileName: `${doc.number}-${company}.pdf`,
      });
    } catch (error) {
      console.error(error);
      toast.error("Téléchargement PDF impossible");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{typeLabel(type)}s</h2>
        <div className="flex gap-2">
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
            <option value="created_at">Date</option>
            <option value="number">Numéro</option>
            <option value="status">Statut</option>
            <option value="total_ttc">Montant</option>
          </Select>
          <Select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as typeof sortDirection)}
          >
            <option value="desc">Décroissant</option>
            <option value="asc">Croissant</option>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/50">
            <tr>
              <th className="px-3 py-2">Numéro</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total TTC</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((doc) => (
              <tr key={doc.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold">{doc.number}</td>
                <td className="px-3 py-2">{doc.client_snapshot?.company_name || "-"}</td>
                <td className="px-3 py-2">
                  <div className="space-y-2">
                    <StatusBadge status={doc.status} />
                    <Select
                      value={doc.status}
                      className="h-8 text-xs"
                      onChange={(e) => updateStatus(doc.id, e.target.value as DocumentStatus)}
                    >
                      {(type === "invoice"
                        ? ["draft", "sent", "pending", "paid", "overdue"]
                        : ["draft", "sent", "accepted", "refused"]
                      ).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </div>
                </td>
                <td className="px-3 py-2">{doc.issue_date}</td>
                <td className="px-3 py-2 text-right">{euro(Number(doc.total_ttc || 0))}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/${type === "invoice" ? "invoices" : "quotes"}/${doc.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pencil size={14} />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingId === doc.id}
                      onClick={() => quickPdf(doc)}
                    >
                      <Download size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingId === doc.id}
                      onClick={() => duplicateDocument(doc)}
                    >
                      <Copy size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingId === doc.id}
                      onClick={() => deleteDocument(doc.id)}
                    >
                      <Trash2 size={14} className="text-rose-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  Aucun document
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
