"use client";

import { pdf } from "@react-pdf/renderer";
import { InvoicePDFDocument } from "@/components/invoice/PDFDocument";
import type { InvoiceFormState, InvoiceTotals, Profile } from "@/types";

export async function downloadInvoicePdf({
  profile,
  document,
  totals,
  fileName,
}: {
  profile: Profile | null;
  document: InvoiceFormState;
  totals: InvoiceTotals;
  fileName: string;
}) {
  const blob = await pdf(
    <InvoicePDFDocument profile={profile} document={document} totals={totals} />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
