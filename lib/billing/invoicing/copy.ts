/**
 * Invoice wording in Spanish and English (§6.14: invoices in ES and EN). Used
 * by the accountant export and by vendor adapters to describe each line. The
 * issuer's data never appear here: they come from LEGAL_ENTITY_* at runtime
 * (I-1). Keep these free of the §3.2 placeholders (lib/legal/documents.test.ts).
 */
import type { InvoiceDocument, InvoiceLine } from "./index";

type Locale = "es" | "en";

export const INVOICE_COPY = {
  es: {
    invoice: "Factura",
    creditNote: "Factura rectificativa",
    credits: "Créditos de uso de la plataforma Caudals (prepago)",
    bonusCredits: "Créditos de bonificación, sin cargo",
    rectifies: "Rectifica la factura {number}",
    refund: "Reembolso de una compra de créditos sin usar",
    vat: "IVA 21 %",
  },
  en: {
    invoice: "Invoice",
    creditNote: "Rectifying invoice",
    credits: "Caudals platform usage credits (prepaid)",
    bonusCredits: "Bonus credits, free of charge",
    rectifies: "Corrects invoice {number}",
    refund: "Refund of an unused credit purchase",
    vat: "VAT 21 %",
  },
} as const satisfies Record<Locale, Record<string, string>>;

const count = (locale: Locale, value: number) =>
  new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 6 }).format(value);
const euros = (cents: number) => (cents / 100).toFixed(2);

/** "2.000 × Créditos … × 0.01 = 20.00" in the document's language. */
export function lineText(line: InvoiceLine, locale: Locale) {
  const copy = INVOICE_COPY[locale];
  const label = line.item === "credits" ? copy.credits : copy.bonusCredits;
  return `${count(locale, line.credits)} × ${label} × ${euros(line.unitPriceCents)} = ${euros(line.netCents)}`;
}

/** The document's title and, for a rectifying invoice, what it corrects and why. */
export function documentHeading(document: Pick<InvoiceDocument, "kind" | "locale" | "original" | "reason">) {
  const copy = INVOICE_COPY[document.locale];
  if (document.kind === "invoice") return copy.invoice;
  const original = document.original?.number ?? "—";
  return `${copy.creditNote} · ${copy.rectifies.replace("{number}", original)} · ${copy.refund}`;
}
