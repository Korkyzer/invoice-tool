import { format, isBefore, parseISO, startOfMonth } from "date-fns";
import type {
  Client,
  DocumentItem,
  DocumentLine,
  DocumentStatus,
  DocumentType,
  InvoiceFormState,
  InvoiceTotals,
  Profile,
  VatRate,
} from "@/types";

export const VAT_RATES: VatRate[] = [0, 5.5, 10, 20];
export const DEFAULT_LEGAL_MENTION_NO_VAT = "TVA non applicable, art. 293 B du CGI.";

export function euro(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(value) ? value : 0);
}

export function toInputDate(date?: string | null): string {
  if (!date) return "";
  return date.slice(0, 10);
}

export function defaultIssueDate() {
  return format(new Date(), "yyyy-MM-dd");
}

export function defaultDueDate(days = 30) {
  const now = new Date();
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return format(due, "yyyy-MM-dd");
}

export function calculateTotals(
  lines: DocumentLine[],
  discountType: "none" | "percent" | "fixed",
  discountValue: number,
): InvoiceTotals {
  const subtotalHt = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
    0,
  );

  const safeDiscountValue = Number.isFinite(discountValue) ? Math.max(discountValue, 0) : 0;

  let discountAmount = 0;
  if (discountType === "percent") {
    discountAmount = subtotalHt * (safeDiscountValue / 100);
  }
  if (discountType === "fixed") {
    discountAmount = safeDiscountValue;
  }
  discountAmount = Math.min(discountAmount, subtotalHt);

  const totalHtAfterDiscount = Math.max(0, subtotalHt - discountAmount);

  const vatByRate: Record<string, number> = {};
  if (subtotalHt === 0) {
    return {
      subtotalHt,
      discountAmount,
      totalHtAfterDiscount,
      vatByRate,
      totalVat: 0,
      totalTtc: 0,
    };
  }

  for (const line of lines) {
    const lineHt = Number(line.quantity || 0) * Number(line.unit_price || 0);
    if (lineHt <= 0) continue;

    const ratio = lineHt / subtotalHt;
    const discountedLineHt = lineHt - discountAmount * ratio;
    const vatRate = Number(line.vat_rate || 0);
    const vatAmount = discountedLineHt * (vatRate / 100);

    vatByRate[String(vatRate)] = (vatByRate[String(vatRate)] || 0) + vatAmount;
  }

  const totalVat = Object.values(vatByRate).reduce((a, b) => a + b, 0);
  const totalTtc = totalHtAfterDiscount + totalVat;

  return {
    subtotalHt,
    discountAmount,
    totalHtAfterDiscount,
    vatByRate,
    totalVat,
    totalTtc,
  };
}

export function statusLabel(status: DocumentStatus): string {
  const labels: Record<DocumentStatus, string> = {
    draft: "Brouillon",
    sent: "Envoyé",
    pending: "En attente",
    paid: "Payé",
    overdue: "En retard",
    accepted: "Accepté",
    refused: "Refusé",
  };
  return labels[status] ?? status;
}

export function typeLabel(type: DocumentType) {
  return type === "invoice" ? "Facture" : "Devis";
}

export function buildInitialFormState(
  type: DocumentType,
  defaults?: Partial<InvoiceFormState>,
): InvoiceFormState {
  return {
    type,
    number: defaults?.number ?? "",
    status: defaults?.status ?? "draft",
    client_id: defaults?.client_id ?? null,
    client: defaults?.client ?? {},
    issue_date: defaults?.issue_date ?? defaultIssueDate(),
    due_date: defaults?.due_date ?? defaultDueDate(),
    payment_date: defaults?.payment_date ?? "",
    notes: defaults?.notes ?? "",
    payment_terms: defaults?.payment_terms ?? "Paiement à réception de facture",
    discount_type: defaults?.discount_type ?? "none",
    discount_value: defaults?.discount_value ?? 0,
    stripe_payment_link_id: defaults?.stripe_payment_link_id ?? null,
    stripe_payment_link_url: defaults?.stripe_payment_link_url ?? null,
    payment_status: defaults?.payment_status ?? "unpaid",
    lines:
      defaults?.lines?.length
        ? defaults.lines
        : [
            {
              description: "",
              quantity: 1,
              unit_price: 0,
              vat_rate: 20,
              position: 0,
            },
          ],
  };
}

export function mapClientToSnapshot(client?: Client | null) {
  if (!client) return {};
  return {
    company_name: client.company_name,
    contact_name: client.contact_name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    siret: client.siret ?? "",
    tva_number: client.tva_number ?? "",
    website: client.website ?? "",
  };
}

export function mapDocumentToFormState(
  document: DocumentItem,
  lines: DocumentLine[],
): InvoiceFormState {
  return {
    id: document.id,
    type: document.type,
    number: document.number,
    status: document.status,
    client_id: document.client_id,
    client: document.client_snapshot ?? {},
    issue_date: toInputDate(document.issue_date),
    due_date: toInputDate(document.due_date),
    payment_date: toInputDate(document.payment_date),
    notes: document.notes ?? "",
    payment_terms: document.payment_terms ?? "",
    discount_type: document.discount_type ?? "none",
    discount_value: Number(document.discount_value ?? 0),
    stripe_payment_link_id: document.stripe_payment_link_id ?? null,
    stripe_payment_link_url: document.stripe_payment_link_url ?? null,
    payment_status: document.payment_status ?? "unpaid",
    lines: lines
      .sort((a, b) => a.position - b.position)
      .map((line, index) => ({
        ...line,
        position: index,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        vat_rate: Number(line.vat_rate) as VatRate,
      })),
  };
}

export function shouldBeOverdue(document: DocumentItem): boolean {
  if (document.type !== "invoice" || document.status !== "pending" || !document.due_date) {
    return false;
  }
  return isBefore(parseISO(document.due_date), startOfDay(new Date()));
}

function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function compareForSort<T extends DocumentItem>(
  docs: T[],
  key: "number" | "created_at" | "total_ttc" | "status",
  direction: "asc" | "desc",
): T[] {
  const sorted = [...docs].sort((a, b) => {
    let result = 0;
    if (key === "total_ttc") result = Number(a.total_ttc) - Number(b.total_ttc);
    if (key === "created_at") result = a.created_at.localeCompare(b.created_at);
    if (key === "status") result = a.status.localeCompare(b.status);
    if (key === "number") result = a.number.localeCompare(b.number);
    return direction === "asc" ? result : -result;
  });
  return sorted;
}

export function monthIsoStart() {
  return format(startOfMonth(new Date()), "yyyy-MM-dd");
}

export function getAutoNoVatLegalMention(profile: Profile | null, totals: InvoiceTotals) {
  if (!profile?.is_micro_entrepreneur) return "";
  if (!profile.auto_legal_mention_no_vat) return "";
  if (Number(totals.totalHtAfterDiscount) <= 0) return "";
  if (Number(totals.totalVat) > 0) return "";
  return profile.legal_mention_no_vat?.trim() || DEFAULT_LEGAL_MENTION_NO_VAT;
}
