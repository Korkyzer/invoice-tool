"use client";

import { Card } from "@/components/ui/card";
import { euro, getAutoNoVatLegalMention, typeLabel } from "@/lib/utils/invoice";
import type { InvoiceFormState, InvoiceTotals, Profile } from "@/types";

interface InvoicePreviewProps {
  document: InvoiceFormState;
  totals: InvoiceTotals;
  profile: Profile | null;
}

export function InvoicePreview({ document, totals, profile }: InvoicePreviewProps) {
  const legalMentionNoVat = getAutoNoVatLegalMention(profile, totals);

  return (
    <Card className="min-h-[760px] bg-white p-8 shadow-xl dark:bg-slate-950">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600">{typeLabel(document.type)}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{document.number || "Numéro auto"}</h2>
        </div>
        <div className="text-right text-sm text-slate-600 dark:text-slate-300">
          <p>Date: {document.issue_date || "-"}</p>
          <p>Échéance: {document.due_date || "-"}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Émetteur</p>
          <p className="font-semibold">{profile?.company_name || "Votre société"}</p>
          <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">{profile?.address || "Adresse"}</p>
          <p>SIRET: {profile?.siret || "-"}</p>
          <p>TVA: {profile?.tva_number || "-"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Client</p>
          <p className="font-semibold">{document.client.company_name || "Client"}</p>
          {document.client.contact_name ? <p>{document.client.contact_name}</p> : null}
          {document.client.address ? <p className="whitespace-pre-line">{document.client.address}</p> : null}
          {document.client.email ? <p>{document.client.email}</p> : null}
          {document.client.siret ? <p>SIRET: {document.client.siret}</p> : null}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-indigo-50 dark:bg-indigo-500/10">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Qté</th>
              <th className="px-3 py-2 text-right">PU HT</th>
              <th className="px-3 py-2 text-right">TVA%</th>
              <th className="px-3 py-2 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{line.description || "-"}</td>
                <td className="px-3 py-2 text-right">{line.quantity}</td>
                <td className="px-3 py-2 text-right">{euro(Number(line.unit_price || 0))}</td>
                <td className="px-3 py-2 text-right">{line.vat_rate}</td>
                <td className="px-3 py-2 text-right">
                  {euro(Number(line.quantity || 0) * Number(line.unit_price || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto mt-6 w-full max-w-sm rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
        <div className="flex justify-between">
          <span>Total HT</span>
          <span>{euro(totals.subtotalHt)}</span>
        </div>
        {totals.discountAmount > 0 ? (
          <div className="flex justify-between">
            <span>Remise</span>
            <span>-{euro(totals.discountAmount)}</span>
          </div>
        ) : null}
        {Object.entries(totals.vatByRate).map(([rate, value]) => (
          <div key={rate} className="flex justify-between">
            <span>TVA {rate}%</span>
            <span>{euro(value)}</span>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold dark:border-slate-700">
          <span>Total TTC</span>
          <span>{euro(totals.totalTtc)}</span>
        </div>
      </div>

      <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <p className="font-medium">Conditions de paiement</p>
        <p>{document.payment_terms || "Paiement à réception de facture"}</p>
        {document.notes ? (
          <>
            <p className="mt-4 font-medium">Notes</p>
            <p>{document.notes}</p>
          </>
        ) : null}
        {legalMentionNoVat ? (
          <>
            <p className="mt-4 font-medium">Mention légale</p>
            <p>{legalMentionNoVat}</p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
