/**
 * Typed wrappers for the invoicing functions of migration 092 (launch L-13).
 * Each takes a client inside the caller's transaction (withTenant). The job
 * and ops actions run as a service identity or a platform admin; owners only
 * read their workspace's documents through billing.invoice_document (RLS).
 */
import type { PoolClient } from "pg";
import { INVOICING_ERROR_CODES, InvoicingError, type InvoicingErrorCode } from "./errors";
import { documentFromRow, type DocumentKind, type DocumentStatus, type InvoiceDocument, type VerifactuStatus } from "./index";

const codes = new Set<string>(INVOICING_ERROR_CODES);
function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (codes.has(message)) throw new InvoicingError(message as InvoicingErrorCode);
  throw error;
}
async function one(db: PoolClient, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  try { return ((await db.query(sql, params)).rows[0]?.d ?? null) as Record<string, unknown> | null; } catch (error) { rethrow(error); }
}

export interface DueDocument { orgId: string; kind: DocumentKind; id: string }

/** Queued documents due for an attempt, across workspaces (service identities, platform admins). */
export async function invoicingDue(db: PoolClient, limit = 25): Promise<DueDocument[]> {
  try {
    return (await db.query("SELECT org_id, kind, document_id FROM billing.invoicing_due($1)", [limit])).rows
      .map(row => ({ orgId: String(row.org_id), kind: row.kind as DocumentKind, id: String(row.document_id) }));
  } catch (error) { rethrow(error); }
}

/** Claims one attempt (lease 10 minutes). Null when not due, taken, or waiting for its original. */
export async function claimInvoicing(db: PoolClient, item: DueDocument): Promise<InvoiceDocument | null> {
  const row = await one(db, "SELECT billing.claim_invoicing($1,$2,$3) AS d", [item.orgId, item.kind, item.id]);
  return row ? documentFromRow(row) : null;
}

export async function recordHandover(db: PoolClient, input: DueDocument & { provider: string; providerReference?: string | null; customerReference?: string | null }) {
  return documentFromRow((await one(db, "SELECT billing.record_invoicing_handover($1,$2,$3,$4,$5,$6) AS d",
    [input.orgId, input.kind, input.id, input.provider, input.providerReference ?? null, input.customerReference ?? null]))!);
}

export async function recordFailure(db: PoolClient, input: DueDocument & { provider: string; code: string }) {
  return documentFromRow((await one(db, "SELECT billing.record_invoicing_failure($1,$2,$3,$4,$5) AS d",
    [input.orgId, input.kind, input.id, input.provider, input.code]))!);
}

export interface IssueInput extends DueDocument {
  number: string; issueDate: string; provider?: string | null; providerReference?: string | null; verifactuStatus?: VerifactuStatus | null;
  pdf?: { objectKey: string; sha256: string; byteSize: number } | null; reason?: string | null; requestId?: string | null;
  customerReference?: string | null;
}

/** Records the document as issued (number, date, PDF). Replays with the same number and date return it. */
export async function issueDocument(db: PoolClient, input: IssueInput) {
  return documentFromRow((await one(db, "SELECT billing.issue_invoice_document($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS d", [
    input.orgId, input.kind, input.id, input.number, input.issueDate, input.provider ?? null, input.providerReference ?? null,
    input.verifactuStatus ?? null, input.pdf?.objectKey ?? null, input.pdf?.sha256 ?? null, input.pdf?.byteSize ?? null,
    input.reason ?? null, input.requestId ?? null, input.customerReference ?? null,
  ]))!);
}

/** Voids a test-mode document (and an invoice's rectifying invoice). Live documents raise INVOICE_VOID_LIVE. */
export async function voidDocument(db: PoolClient, input: DueDocument & { reason: string; requestId?: string | null }) {
  return documentFromRow((await one(db, "SELECT billing.void_invoice_document($1,$2,$3,$4,$5) AS d",
    [input.orgId, input.kind, input.id, input.reason, input.requestId ?? null]))!);
}

const DOCUMENT_COLUMNS = `d.*, (SELECT jsonb_build_object('id', i.id, 'status', i.status, 'series_code', i.series_code, 'number', i.number,
  'issue_date', i.issue_date, 'provider', i.provider, 'provider_reference', i.provider_reference)
  FROM billing.invoice i WHERE i.org_id = d.org_id AND i.id = d.invoice_id) AS original`;

/** The workspace's documents (RLS-scoped), newest first, voided test documents left out. */
export async function listDocuments(db: PoolClient, orgId: string, limit = 500): Promise<InvoiceDocument[]> {
  return (await db.query(`SELECT ${DOCUMENT_COLUMNS} FROM billing.invoice_document d WHERE d.org_id = $1 AND d.status <> 'voided'
    ORDER BY d.created_at DESC, d.id DESC LIMIT $2`, [orgId, limit])).rows.map(documentFromRow);
}

/** One document of the workspace by id (either kind), or null. */
export async function getDocument(db: PoolClient, orgId: string, id: string, kind?: DocumentKind): Promise<InvoiceDocument | null> {
  const row = (await db.query(`SELECT ${DOCUMENT_COLUMNS} FROM billing.invoice_document d WHERE d.org_id = $1 AND d.id = $2
    AND ($3::text IS NULL OR d.kind = $3)`, [orgId, id, kind ?? null])).rows[0];
  return row ? documentFromRow(row) : null;
}

export interface AdminDocument {
  kind: DocumentKind; id: string; orgId: string; workspace: string; orderId: string; livemode: boolean; seriesCode: string; status: DocumentStatus;
  number: string | null; issueDate: string | null; operationDate: string; grossCents: number; taxTreatment: string; legalName: string; taxId: string;
  country: string; provider: string | null; attempts: number; lastErrorCode: string | null; pdfAttached: boolean; createdAt: string;
}

/** Documents across workspaces for ops (platform admins, services). */
export async function adminDocuments(db: PoolClient, filter: { status?: DocumentStatus | null; livemode?: boolean | null; limit?: number } = {}): Promise<AdminDocument[]> {
  try {
    const rows = (await db.query("SELECT billing.invoice_documents_admin($1,$2,$3) AS d", [filter.status ?? null, filter.livemode ?? null, filter.limit ?? 100])).rows;
    return rows.map(({ d }) => ({
      kind: d.kind, id: d.id, orgId: d.org_id, workspace: d.workspace, orderId: d.order_id, livemode: d.livemode, seriesCode: d.series_code,
      status: d.status, number: d.number, issueDate: d.issue_date, operationDate: d.operation_date, grossCents: Number(d.gross_cents),
      taxTreatment: d.tax_treatment, legalName: d.legal_name, taxId: d.tax_id, country: d.country, provider: d.provider,
      attempts: Number(d.attempts), lastErrorCode: d.last_error_code, pdfAttached: Boolean(d.pdf_attached), createdAt: d.created_at,
    }));
  } catch (error) { rethrow(error); }
}

/** The monthly accountant export as the database computes it (billing.accountant_export). */
export async function accountantExport(db: PoolClient, month: string, livemode: boolean): Promise<Record<string, unknown>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new InvoicingError("INPUT_INVALID");
  return (await one(db, "SELECT billing.accountant_export($1::date,$2) AS d", [`${month}-01`, livemode]))!;
}
