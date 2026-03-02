export type DocumentType = "invoice" | "quote";

export type QuoteStatus = "draft" | "sent" | "accepted" | "refused";
export type InvoiceStatus = "draft" | "sent" | "pending" | "paid" | "overdue";
export type DocumentStatus = QuoteStatus | InvoiceStatus;

export type VatRate = 0 | 5.5 | 10 | 20;

export interface Profile {
  id: string;
  user_id: string;
  company_name: string | null;
  siret: string | null;
  tva_number: string | null;
  address: string | null;
  iban: string | null;
  email: string | null;
  logo_url: string | null;
  default_payment_terms: string;
  default_vat_rate: number;
  is_micro_entrepreneur: boolean;
  auto_legal_mention_no_vat: boolean;
  legal_mention_no_vat: string;
  invoice_prefix: string;
  quote_prefix: string;
  invoice_next_number: number;
  quote_next_number: number;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  siret: string | null;
  tva_number?: string | null;
  website?: string | null;
  created_at: string;
}

export interface DocumentLine {
  id?: string;
  document_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: VatRate;
  position: number;
}

export interface ClientSnapshot {
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  siret?: string;
  tva_number?: string;
  website?: string;
}

export interface DocumentItem {
  id: string;
  user_id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  client_id: string | null;
  client_snapshot: ClientSnapshot | null;
  issue_date: string;
  due_date: string | null;
  payment_date: string | null;
  subtotal_ht: number;
  total_tva: number;
  total_ttc: number;
  notes: string | null;
  payment_terms: string | null;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
  converted_from_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentWithLines extends DocumentItem {
  lines: DocumentLine[];
}

export interface InvoiceFormState {
  id?: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  client_id: string | null;
  client: ClientSnapshot;
  issue_date: string;
  due_date: string;
  payment_date: string;
  notes: string;
  payment_terms: string;
  discount_type: "percent" | "fixed" | "none";
  discount_value: number;
  lines: DocumentLine[];
}

export interface InvoiceTotals {
  subtotalHt: number;
  discountAmount: number;
  totalHtAfterDiscount: number;
  vatByRate: Record<string, number>;
  totalVat: number;
  totalTtc: number;
}

export interface InvoiceAssistantPatch {
  client?: Partial<ClientSnapshot>;
  lines?: Array<Partial<DocumentLine>>;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  payment_terms?: string;
}
