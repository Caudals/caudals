/**
 * A stand-in invoicing vendor for tests (launch L-13): it proves the adapter
 * interface carries what a real Spanish invoicing API needs. It keeps
 * customers by tax ID, issues numbers in the document's series (TEST- in test
 * mode), is idempotent per document id like a vendor called with an
 * idempotency key, refuses a rectifying invoice before its original is
 * issued, returns a PDF, and can fail each document a number of times to
 * exercise the retry queue. Not a real vendor: D-04 is open.
 */
import { InvoicingProviderError } from "../../lib/billing/invoicing/errors";
import type { InvoiceDocument, InvoicingAdapter, IssueOutcome } from "../../lib/billing/invoicing/index";

export function fakePdf(label: string) {
  return new Uint8Array(Buffer.from(`%PDF-1.4\n% fake invoice for tests: ${label}\n${"0".repeat(64)}\n%%EOF\n`, "latin1"));
}

export function fakeInvoicingProvider(options: { failTimes?: number; pdf?: boolean; name?: string } = {}) {
  const issued = new Map<string, { number: string; issueDate: string; reference: string }>();
  const customers = new Map<string, string>();
  const calls: string[] = [];
  // Each document fails failTimes times before it is issued.
  const failures = new Map<string, number>();
  // Test-mode numbers carry a run id, so several fakes in one database never collide.
  const run = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  let sequence = 0;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

  function issue(document: InvoiceDocument, prefix: string): IssueOutcome {
    const failed = failures.get(document.id) ?? 0;
    if (failed < (options.failTimes ?? 0)) { failures.set(document.id, failed + 1); throw new InvoicingProviderError("provider_unavailable"); }
    let record = issued.get(document.id);
    if (!record) {
      sequence++;
      const number = document.livemode ? `${prefix}${today().slice(0, 4)}-${String(sequence).padStart(4, "0")}` : `TEST-${prefix}${run}${sequence}`;
      record = { number, issueDate: today(), reference: `fake_inv_${sequence}` };
      issued.set(document.id, record);
    }
    return {
      status: "issued", number: record.number, issueDate: record.issueDate, providerReference: record.reference, verifactuStatus: "accepted",
      pdf: options.pdf === false ? null : fakePdf(record.number),
    };
  }

  const adapter: InvoicingAdapter = {
    name: options.name ?? "fakeprovider",
    async syncCustomer(customer) {
      calls.push(`customer:${customer.taxId}`);
      if (!customer.taxId || !customer.legalName) throw new InvoicingProviderError("customer_invalid", false);
      const reference = customers.get(customer.taxId) ?? `fake_cus_${customers.size + 1}`;
      customers.set(customer.taxId, reference);
      return { reference };
    },
    async issueInvoice(document, context) {
      calls.push(`invoice:${document.id}:${context.customerReference}`);
      return issue(document, "CAU-");
    },
    async issueRectifying(document, context) {
      calls.push(`rectifying:${document.id}:${context.customerReference}`);
      if (!document.original?.providerReference && !document.original?.number) throw new InvoicingProviderError("original_not_issued");
      return issue(document, "CAU-R-");
    },
    async fetchPdf(document) {
      const record = issued.get(document.id);
      return record ? fakePdf(record.number) : null;
    },
  };
  return { adapter, calls, issued, customers };
}
