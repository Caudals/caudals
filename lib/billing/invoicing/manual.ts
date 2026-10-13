/**
 * The manual invoicing adapter (launch spec v2 §6.14 fallback; decision I-4).
 *
 * Until the founder chooses an invoicing service with the gestor (D-04), the
 * accountant issues every invoice and rectifying invoice from the monthly
 * export (scripts/billing/monthly-export.ts), which lists each request with
 * its full fiscal data and expected series. This adapter therefore issues
 * nothing: it accepts each request as "pending issue". Ops then attach the
 * number the accountant issued and its PDF through
 * POST /api/evals/v1/billing/admin/invoices/:id (platform admin, audited),
 * and owners can download that PDF.
 *
 * It never makes up an invoice number or a PDF: a legal number exists only
 * once the accountant has issued it.
 */
import { InvoicingProviderError } from "./errors";
import type { InvoicingAdapter } from "./index";

export const MANUAL_PROVIDER = "manual";

export function manualInvoicingAdapter(): InvoicingAdapter {
  return {
    name: MANUAL_PROVIDER,
    // The accountant keeps the customer records; the request carries the fiscal data.
    async syncCustomer() { return { reference: null }; },
    async issueInvoice(document) {
      if (document.kind !== "invoice") throw new InvoicingProviderError("wrong_document_kind", false);
      return { status: "pending_issue" };
    },
    async issueRectifying(document) {
      if (document.kind !== "credit_note" || !document.invoiceId) throw new InvoicingProviderError("original_missing", false);
      return { status: "pending_issue" };
    },
    // PDFs are the accountant's, attached by ops and served from private storage.
    async fetchPdf() { return null; },
  };
}
