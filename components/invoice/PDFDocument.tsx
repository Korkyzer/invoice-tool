/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ClientSnapshot, DocumentType, InvoiceFormState, InvoiceTotals, Profile } from "@/types";
import { euro, getAutoNoVatLegalMention, typeLabel } from "@/lib/utils/invoice";

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "Helvetica",
    padding: 32,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#4f46e5",
  },
  meta: {
    textAlign: "right",
    lineHeight: 1.4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  block: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2ff",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    padding: 6,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: "row",
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  colDescription: { width: "40%" },
  colSmall: { width: "12%", textAlign: "right" },
  totals: {
    marginTop: 14,
    marginLeft: "auto",
    width: 240,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 8,
    lineHeight: 1.6,
  },
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    lineHeight: 1.5,
  },
  logo: {
    width: 90,
    height: 50,
    objectFit: "contain",
  },
});

interface PDFDocumentProps {
  profile: Profile | null;
  document: InvoiceFormState;
  totals: InvoiceTotals;
}

function companyBlock(profile: Profile | null) {
  return (
    <View style={styles.block}>
      <Text>{profile?.company_name || "Votre société"}</Text>
      <Text>{profile?.address || "Adresse"}</Text>
      <Text>SIRET: {profile?.siret || "-"}</Text>
      <Text>TVA: {profile?.tva_number || "-"}</Text>
      <Text>Email: {profile?.email || "-"}</Text>
    </View>
  );
}

function clientBlock(client: ClientSnapshot) {
  return (
    <View style={styles.block}>
      <Text>{client.company_name || "Client"}</Text>
      {client.contact_name ? <Text>Contact: {client.contact_name}</Text> : null}
      {client.address ? <Text>{client.address}</Text> : null}
      {client.email ? <Text>Email: {client.email}</Text> : null}
      {client.phone ? <Text>Tél: {client.phone}</Text> : null}
      {client.website ? <Text>Site: {client.website}</Text> : null}
      {client.siret ? <Text>SIRET: {client.siret}</Text> : null}
      {client.tva_number ? <Text>TVA: {client.tva_number}</Text> : null}
    </View>
  );
}

export function InvoicePDFDocument({ profile, document, totals }: PDFDocumentProps) {
  const title = typeLabel(document.type as DocumentType);
  const legalMentionNoVat = getAutoNoVatLegalMention(profile, totals);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text>{document.number}</Text>
          </View>
          <View style={styles.meta}>
            <Text>Date d&apos;émission: {document.issue_date || "-"}</Text>
            <Text>Échéance: {document.due_date || "-"}</Text>
            {profile?.logo_url ? <Image src={profile.logo_url} style={styles.logo} /> : null}
          </View>
        </View>

        <View style={styles.row}>
          {companyBlock(profile)}
          {clientBlock(document.client)}
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colSmall}>Qté</Text>
          <Text style={styles.colSmall}>PU HT</Text>
          <Text style={styles.colSmall}>TVA%</Text>
          <Text style={styles.colSmall}>Total HT</Text>
        </View>

        {document.lines.map((line, index) => (
          <View style={styles.tableRow} key={`${line.description}-${index}`}>
            <Text style={styles.colDescription}>{line.description || "-"}</Text>
            <Text style={styles.colSmall}>{line.quantity}</Text>
            <Text style={styles.colSmall}>{euro(Number(line.unit_price || 0))}</Text>
            <Text style={styles.colSmall}>{line.vat_rate}</Text>
            <Text style={styles.colSmall}>
              {euro(Number(line.quantity || 0) * Number(line.unit_price || 0))}
            </Text>
          </View>
        ))}

        <View style={styles.totals}>
          <Text>Total HT: {euro(totals.subtotalHt)}</Text>
          {totals.discountAmount > 0 ? <Text>Remise: -{euro(totals.discountAmount)}</Text> : null}
          {Object.entries(totals.vatByRate).map(([rate, amount]) => (
            <Text key={rate}>TVA {rate}%: {euro(amount)}</Text>
          ))}
          <Text>Total TTC: {euro(totals.totalTtc)}</Text>
        </View>

        <View style={styles.footer}>
          <Text>{document.payment_terms || profile?.default_payment_terms || "Paiement à réception"}</Text>
          <Text>IBAN: {profile?.iban || "-"}</Text>
          {document.notes ? <Text>Notes: {document.notes}</Text> : null}
          {legalMentionNoVat ? <Text>Mention légale: {legalMentionNoVat}</Text> : null}
          <Text>Conformément à la législation française, tout retard de paiement peut entraîner des pénalités.</Text>
        </View>
      </Page>
    </Document>
  );
}
