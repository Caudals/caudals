/**
 * The invoicing job and its retry queue (launch spec v2 §6.14; L-13), run
 * every minute by the evals scheduler under its service identity.
 *
 * For each queued document due for an attempt (invoices before rectifying
 * invoices): claim one attempt (a 10-minute lease, so a crash retries), sync
 * the customer, ask the adapter to issue it, and record the outcome:
 *   - pending_issue (the manual adapter): handed over, waiting for the accountant;
 *   - issued (a vendor): number, date, Verifactu status and PDF recorded, and
 *     the billing contact gets "invoice available" with the PDF;
 *   - a failure: the document stays queued and is retried after 1, 2, 4 … 60
 *     minutes; scripts/evals/health-alerts.sh alerts once a document has waited
 *     an hour with failures (or a day without any attempt).
 * Every database step is idempotent, and adapters take the document id as
 * their idempotency key, so a retry never issues twice.
 */
import type { Pool } from "pg";
import { withTenant } from "@/lib/evals/repositories/db";
import { getLegalEntity, type LegalEntity } from "@/lib/legal/entity";
import { InvoicingError, InvoicingProviderError } from "./errors";
import { createInvoicingAdapter, invoicingProvider, type InvoiceDocument, type InvoicingAdapter } from "./index";
import { sendInvoiceAvailable } from "./emails";
import { discardInvoicePdf, sealInvoicePdf, type StorePdf } from "./pdf";
import { claimInvoicing, invoicingDue, issueDocument, recordFailure, recordHandover } from "./store";

type Env = Record<string, string | undefined>;

export interface InvoicingTick { due: number; handedOver: number; issued: number; failed: number; waiting: number }

export interface InvoicingDeps {
  adapter?: InvoicingAdapter | null;
  pool?: Pool;
  env?: Env;
  limit?: number;
  storePdf?: StorePdf;
  issuer?: LegalEntity | null;
  /** After a provider issued a document (default: the "invoice available" email). */
  afterIssued?: (document: InvoiceDocument, pdf: Uint8Array | null) => Promise<unknown>;
}

function failureCode(error: unknown) {
  if (error instanceof InvoicingProviderError && /^[a-z][a-z0-9_]{1,63}$/.test(error.code)) return error.code;
  if (error instanceof InvoicingError) return error.code.toLowerCase();
  return "provider_error";
}

/** One pass over the queued documents. Without a configured adapter it does nothing. */
export async function runInvoicing(actorId: string, deps: InvoicingDeps = {}): Promise<InvoicingTick> {
  const tick: InvoicingTick = { due: 0, handedOver: 0, issued: 0, failed: 0, waiting: 0 };
  const env = deps.env ?? process.env;
  const provider = invoicingProvider(env);
  const adapter = deps.adapter !== undefined ? deps.adapter : provider === "off" ? null : createInvoicingAdapter(provider);
  if (!adapter) {
    if (provider !== "off") console.error(JSON.stringify({ event: "billing_invoicing_provider_unknown", provider }));
    return tick;
  }
  const issuer = deps.issuer !== undefined ? deps.issuer : getLegalEntity(env);
  const due = await withTenant({ orgId: "", actorId }, db => invoicingDue(db, deps.limit ?? 25), deps.pool);
  tick.due = due.length;
  for (const item of due) {
    const scope = { orgId: item.orgId, actorId };
    let document: InvoiceDocument | null = null;
    try {
      document = await withTenant(scope, db => claimInvoicing(db, item), deps.pool);
      if (!document) { tick.waiting++; continue; }
      const customer = await adapter.syncCustomer(document.customer, { orgId: document.orgId, livemode: document.livemode });
      const context = { issuer, customerReference: customer.reference };
      const outcome = document.kind === "invoice" ? await adapter.issueInvoice(document, context) : await adapter.issueRectifying(document, context);
      if (outcome.status === "pending_issue") {
        await withTenant(scope, db => recordHandover(db, { ...item, provider: adapter.name, providerReference: outcome.providerReference ?? null,
          customerReference: customer.reference }), deps.pool);
        tick.handedOver++;
        continue;
      }
      const pdf = outcome.pdf?.length ? outcome.pdf : null;
      const sealed = pdf ? await (deps.storePdf ?? sealInvoicePdf)(document, pdf) : null;
      let issued: InvoiceDocument;
      try {
        issued = await withTenant(scope, db => issueDocument(db, {
          ...item, number: outcome.number, issueDate: outcome.issueDate, provider: adapter.name, providerReference: outcome.providerReference ?? null,
          verifactuStatus: outcome.verifactuStatus ?? null, pdf: sealed, customerReference: customer.reference,
        }), deps.pool);
      } catch (error) {
        if (sealed) await discardInvoicePdf(sealed.objectKey);
        throw error;
      }
      tick.issued++;
      await (deps.afterIssued ?? ((doc, bytes) => sendInvoiceAvailable(doc, bytes, deps.pool, env)))(issued, pdf);
    } catch (error) {
      tick.failed++;
      const code = failureCode(error);
      console.error(JSON.stringify({ event: "billing_invoicing_failed", kind: item.kind, document: item.id, provider: adapter.name, code }));
      if (document) {
        await withTenant(scope, db => recordFailure(db, { ...item, provider: adapter.name, code }), deps.pool)
          .catch(() => console.error(JSON.stringify({ event: "billing_invoicing_failure_not_recorded", document: item.id })));
      }
    }
  }
  return tick;
}
