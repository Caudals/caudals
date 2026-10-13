/**
 * Invoicing for credit top-ups (launch spec v2 §6.14, §6.16; package L-13;
 * decisions D-04, D-05, I-1, I-4).
 *
 * Stripe takes the money; a Spanish invoicing service (D-04, not chosen yet)
 * issues the invoices. Migration 092 queues one invoice per paid order and
 * one rectifying invoice (factura rectificativa) per refunded order, in the
 * payment's own transaction, with the buyer's fiscal data, the series
 * (CAU- credits, CAU-R- rectifying; §3.2, to confirm with the gestor) and the
 * VAT line or legal mention of the order's treatment:
 *
 * | Treatment            | VAT       | Mention                        |
 * | es_vat               | 21 % IVA  | —  (both NIFs on the invoice)  |
 * | eu_reverse_charge    | none      | "Inversión del sujeto pasivo"  |
 * | non_eu_not_subject   | none      | "Operación no sujeta"          |
 *
 * This module is the adapter boundary. The invoicing job (./jobs.ts, in the
 * evals scheduler) hands each queued document to the adapter named by
 * BILLING_INVOICING_PROVIDER:
 *
 * - "manual" (./manual.ts): until a vendor is chosen, the accountant issues
 *   the invoices from the monthly export (scripts/billing/monthly-export.ts).
 *   The adapter only marks each request "pending issue"; ops attach the
 *   issued number and PDF through the platform-admin API. It never makes up
 *   an invoice number or a PDF.
 * - a vendor adapter (lib/billing/invoicing/<provider>.ts, added with D-04)
 *   syncs the customer, issues the invoice or the rectifying invoice and
 *   returns its number, Verifactu status and PDF.
 * - unset or "off": nothing is handed over; requests stay queued and the
 *   health check reports them after a day.
 *
 * The issuer is Caudals' legal entity, read at runtime from LEGAL_ENTITY_*
 * (I-1) and never from the §3.2 placeholders (lib/legal/entity.ts ignores
 * them). No invoice template or copy in this directory may contain them
 * (lib/legal/documents.test.ts).
 *
 * No React and no email here: the scheduler imports this module.
 */
import type { LegalEntity } from "@/lib/legal/entity";
import type { TaxIdKind, TaxTreatment, ViesStatus } from "../tax";
import { manualInvoicingAdapter } from "./manual";

export { InvoicingError, InvoicingProviderError, INVOICING_ERROR_CODES, type InvoicingErrorCode } from "./errors";

type Env = Record<string, string | undefined>;

export type DocumentKind = "invoice" | "credit_note";
export type DocumentStatus = "queued" | "pending_issue" | "issued" | "voided";
export type VerifactuStatus = "not_applicable" | "pending" | "accepted" | "accepted_with_errors" | "rejected";
export const VERIFACTU_STATUSES: readonly VerifactuStatus[] = ["not_applicable", "pending", "accepted", "accepted_with_errors", "rejected"];

/** Invoice series (§3.2). Issued live numbers must match the series' pattern in billing.invoice_series. */
export const INVOICE_SERIES = { credits: "CAU", services: "CAU-S", rectifying: "CAU-R" } as const;

/* ------------------------------------------------------------- config --- */

/**
 * BILLING_INVOICING_PROVIDER: "manual" or a vendor adapter name; anything
 * unset, "off" or malformed is "off". Read on the server at runtime (web app
 * and scheduler), never through NEXT_PUBLIC_*.
 */
export function invoicingProvider(env: Env = process.env): string {
  const value = env.BILLING_INVOICING_PROVIDER?.trim().toLowerCase();
  if (!value || value === "off" || value === "false") return "off";
  return /^[a-z][a-z0-9_]{1,39}$/.test(value) ? value : "off";
}

export function invoicingEnabled(env: Env = process.env) {
  return invoicingProvider(env) !== "off";
}

/* ------------------------------------------------------------- shapes --- */

export interface InvoiceParty {
  legalName: string; country: string; taxId: string; taxIdKind: TaxIdKind; viesStatus: ViesStatus; viesConsultation: string | null;
  addressLine1: string; addressLine2: string | null; postalCode: string; city: string; region: string | null; billingEmail: string;
}

export interface InvoiceLine {
  item: "credits" | "bonus_credits";
  /** Negative on a rectifying invoice. May have up to six decimals for bonus credits. */
  credits: number;
  unitPriceCents: number;
  netCents: number;
}

export interface StoredPdf { objectKey: string; sha256: string; byteSize: number; attachedAt: Date }

export interface InvoiceDocument {
  kind: DocumentKind; id: string; orgId: string; orderId: string; livemode: boolean; seriesCode: string;
  status: DocumentStatus; number: string | null; issueDate: string | null; operationDate: string; locale: "es" | "en"; currency: "eur";
  netCents: number; vatRateBp: number; vatCents: number; grossCents: number; taxTreatment: TaxTreatment; taxMention: string | null;
  customer: InvoiceParty; lines: InvoiceLine[];
  provider: string | null; providerReference: string | null; providerCustomerReference: string | null; verifactuStatus: VerifactuStatus | null;
  pdf: StoredPdf | null; attempts: number; lastErrorCode: string | null;
  handedOverAt: Date | null; issuedAt: Date | null; voidedAt: Date | null; createdAt: Date;
  /** Rectifying invoices: the invoice they correct, and why. */
  invoiceId: string | null; reason: "refund" | null;
  original: { id: string; status: DocumentStatus; seriesCode: string; number: string | null; issueDate: string | null; provider: string | null; providerReference: string | null } | null;
}

type Row = Record<string, unknown>;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const date = (value: unknown) => (value ? new Date(value as string) : null);
/** A DATE column: node-pg gives a Date at local midnight for table rows; to_jsonb gives "YYYY-MM-DD". */
const day = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
};

export function partyFromSnapshot(snapshot: Row): InvoiceParty {
  return {
    legalName: String(snapshot.legal_name ?? ""), country: String(snapshot.country ?? ""), taxId: String(snapshot.tax_id ?? ""),
    taxIdKind: snapshot.tax_id_kind as TaxIdKind, viesStatus: snapshot.vies_status as ViesStatus, viesConsultation: str(snapshot.vies_consultation),
    addressLine1: String(snapshot.address_line1 ?? ""), addressLine2: str(snapshot.address_line2), postalCode: String(snapshot.postal_code ?? ""),
    city: String(snapshot.city ?? ""), region: str(snapshot.region), billingEmail: String(snapshot.billing_email ?? ""),
  };
}

/** Maps a document row (billing.invoice_document, or the JSON the 092 functions return). */
export function documentFromRow(row: Row): InvoiceDocument {
  const original = row.original as Row | null | undefined;
  const lines = (Array.isArray(row.lines) ? row.lines : []) as Row[];
  return {
    kind: row.kind as DocumentKind, id: String(row.id), orgId: String(row.org_id), orderId: String(row.order_id), livemode: Boolean(row.livemode),
    seriesCode: String(row.series_code), status: row.status as DocumentStatus, number: str(row.number), issueDate: day(row.issue_date),
    operationDate: day(row.operation_date)!, locale: row.locale === "es" ? "es" : "en", currency: "eur",
    netCents: Number(row.net_cents), vatRateBp: Number(row.vat_rate_bp), vatCents: Number(row.vat_cents), grossCents: Number(row.gross_cents),
    taxTreatment: row.tax_treatment as TaxTreatment, taxMention: str(row.tax_mention), customer: partyFromSnapshot((row.customer ?? {}) as Row),
    lines: lines.map(line => ({ item: line.item as InvoiceLine["item"], credits: Number(line.credits), unitPriceCents: Number(line.unit_price_cents), netCents: Number(line.net_cents) })),
    provider: str(row.provider), providerReference: str(row.provider_reference), providerCustomerReference: str(row.provider_customer_reference),
    verifactuStatus: (row.verifactu_status ?? null) as VerifactuStatus | null,
    pdf: row.pdf_object_key ? { objectKey: String(row.pdf_object_key), sha256: String(row.pdf_sha256), byteSize: Number(row.pdf_byte_size), attachedAt: new Date(row.pdf_attached_at as string) } : null,
    attempts: Number(row.attempts ?? 0), lastErrorCode: str(row.last_error_code), handedOverAt: date(row.handed_over_at), issuedAt: date(row.issued_at),
    voidedAt: date(row.voided_at), createdAt: new Date(row.created_at as string),
    invoiceId: str(row.invoice_id), reason: (row.reason ?? null) as InvoiceDocument["reason"],
    original: original ? {
      id: String(original.id), status: original.status as DocumentStatus, seriesCode: String(original.series_code), number: str(original.number),
      issueDate: day(original.issue_date), provider: str(original.provider), providerReference: str(original.provider_reference),
    } : null,
  };
}

/* ------------------------------------------------------------ adapter --- */

/** What the provider did with a document. */
export type IssueOutcome =
  /** Accepted, to be issued later (the manual adapter: by the accountant). */
  | { status: "pending_issue"; providerReference?: string | null }
  /** Issued now: the number in the document's series, the issue date (YYYY-MM-DD, Madrid) and optionally the PDF. */
  | { status: "issued"; number: string; issueDate: string; providerReference?: string | null; verifactuStatus?: VerifactuStatus | null; pdf?: Uint8Array | null };

export interface InvoicingContext {
  /** Caudals' legal entity from LEGAL_ENTITY_*, or null while it is not configured (I-1). */
  issuer: LegalEntity | null;
  /** The provider's customer reference from syncCustomer. */
  customerReference: string | null;
}

/**
 * An invoicing service. Every call must be idempotent per document id (a
 * retry after a timeout must not issue twice): vendors take the document id
 * as their idempotency key or external reference.
 */
export interface InvoicingAdapter {
  readonly name: string;
  /** Creates or updates the buyer in the provider (by tax ID). */
  syncCustomer(customer: InvoiceParty, scope: { orgId: string; livemode: boolean }): Promise<{ reference: string | null }>;
  /** An invoice for a paid order (series CAU). */
  issueInvoice(document: InvoiceDocument, context: InvoicingContext): Promise<IssueOutcome>;
  /** A rectifying invoice (series CAU-R) for a refund; document.original is the invoice it corrects. */
  issueRectifying(document: InvoiceDocument, context: InvoicingContext): Promise<IssueOutcome>;
  /** The issued document's PDF from the provider, or null when it has none (manual: ops attach it). */
  fetchPdf(document: InvoiceDocument): Promise<Uint8Array | null>;
}

/** The adapter for a provider name, or null (off, or a vendor not built yet). */
export function createInvoicingAdapter(name: string): InvoicingAdapter | null {
  if (name === "manual") return manualInvoicingAdapter();
  return null;
}

/* ------------------------------------------------------------ helpers --- */

/** The series an issued number must belong to, by document kind. */
export function seriesFor(kind: DocumentKind) {
  return kind === "invoice" ? INVOICE_SERIES.credits : INVOICE_SERIES.rectifying;
}

/** Whether a number fits the document: its series in live mode, TEST- in test mode (mirrors billing.invoice_series). */
export function numberFitsDocument(number: string, document: Pick<InvoiceDocument, "kind" | "livemode">) {
  if (!document.livemode) return /^TEST-[A-Za-z0-9/._-]{1,40}$/.test(number);
  return document.kind === "invoice" ? /^CAU-[0-9][0-9A-Za-z/._-]{0,39}$/.test(number) : /^CAU-R-[0-9][0-9A-Za-z/._-]{0,39}$/.test(number);
}

/** The owner-facing state: requests are "pending" until the invoice is issued; voided test documents say so. */
export function documentView(document: InvoiceDocument) {
  const status = document.status === "issued" || document.status === "voided" ? document.status : "pending" as const;
  return {
    id: document.id, kind: document.kind, orderId: document.orderId, status,
    series: document.seriesCode, number: document.number, issueDate: document.issueDate, operationDate: document.operationDate,
    currency: "EUR", netCents: document.netCents, vatRateBp: document.vatRateBp, vatCents: document.vatCents, grossCents: document.grossCents,
    taxTreatment: document.taxTreatment, taxMention: document.taxMention, rectifies: document.invoiceId, livemode: document.livemode,
    pdfAvailable: document.status === "issued" && Boolean(document.pdf || document.provider !== "manual"),
  };
}
