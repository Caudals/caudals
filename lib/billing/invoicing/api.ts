/**
 * Server handlers for the invoice endpoints (launch spec v2 §6.16; L-13).
 *
 * Owners: GET /api/evals/v1/billing/invoices and …/invoices/:id/pdf. Roles are
 * checked here, server-side: the workspace owner reads; a platform admin may
 * read too (audited support access by requireWorkspace). Both answer 404 while
 * invoicing is off (BILLING_INVOICING_PROVIDER unset).
 *
 * Platform admins: GET /api/evals/v1/billing/admin/invoices lists documents
 * across workspaces (what the accountant has to issue); POST …/admin/invoices/:id
 * attaches the number and PDF the accountant issued ({action: "issue"}) or voids
 * a Stripe test-mode document ({action: "void"}). POSTs need a sign-in within
 * 15 minutes, an Idempotency-Key and a reason, and are audited in the database.
 * The L-16 console and the L-15 Invoices tab build on these.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { InvoicingError } from "./errors";
import { sendInvoiceAvailable } from "./emails";
import {
  createInvoicingAdapter, documentView, invoicingEnabled, numberFitsDocument, type DocumentKind, type InvoiceDocument,
} from "./index";
import { InvoicePdfError, MAX_INVOICE_PDF_BYTES, checkInvoicePdf, discardInvoicePdf, readInvoicePdf, sealInvoicePdf, type StorePdf } from "./pdf";
import { adminDocuments, getDocument, issueDocument, listDocuments, voidDocument } from "./store";

const MESSAGES: Record<string, [number, string]> = {
  INVOICE_NOT_FOUND: [404, "Invoice not found."],
  INVOICE_NUMBER_INVALID: [422, "The number must belong to the document's series (CAU-… for invoices, CAU-R-… for rectifying invoices), or start with TEST- for a Stripe test-mode document."],
  INVOICE_NUMBER_TAKEN: [409, "That number is already used in the series."],
  INVOICE_ALREADY_ISSUED: [409, "This document is already issued with a different number, date or PDF."],
  INVOICE_VOIDED: [409, "This test document was voided."],
  INVOICE_VOID_LIVE: [409, "Live invoices are never voided. A refund issues a rectifying invoice instead."],
  ISSUE_DATE_INVALID: [422, "The issue date must be on or after the operation date (and the original invoice's date) and not in the future."],
  ORIGINAL_NOT_ISSUED: [409, "Attach the original invoice first: a rectifying invoice cites its number."],
  REASON_REQUIRED: [422, "Give a reason of 3 to 2,000 characters."],
  INPUT_INVALID: [422, "Check the supplied fields."],
  PDF_INVALID: [422, "Attach the issued invoice as a PDF file."],
  PDF_TOO_LARGE: [413, "The PDF is larger than 5 MB."],
};

export function invoicingApiError(error: unknown): never {
  const code = error instanceof InvoicingError || error instanceof InvoicePdfError ? error.code : null;
  if (code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
  if (code && MESSAGES[code]) { const [status, message] = MESSAGES[code]; throw new EvalError(code, status, message); }
  throw error;
}

/* -------------------------------------------------------------- owners --- */

/** The workspace owner (or, to read, a platform admin), while invoicing is on. */
export async function requireInvoiceOwner(identity: EvalIdentity, orgId: string) {
  if (!invoicingEnabled()) throw new EvalError("SCOPE_DENIED", 404);
  const role = identity.workspaces.find(workspace => workspace.id === orgId)?.role;
  if (role !== "owner" && identity.platformRole !== "platform_admin") throw new EvalError("SCOPE_DENIED", 404);
  await requireWorkspace(identity, orgId, "read");
}

/** GET /invoices: the workspace's invoices and rectifying invoices, newest first. */
export async function listInvoices(identity: EvalIdentity, orgId: string) {
  await requireInvoiceOwner(identity, orgId);
  const documents = await withTenant({ orgId, actorId: identity.user.id }, db => listDocuments(db, orgId));
  return { invoices: documents.map(document => ({ ...documentView(document), rectifiesNumber: document.original?.number ?? null })) };
}

/** A safe download name: the invoice number. */
export function pdfFileName(document: Pick<InvoiceDocument, "number" | "id">) {
  return `${(document.number ?? document.id).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
}

/**
 * GET /invoices/:id/pdf: the issued document's PDF. Stored PDFs (attached by
 * ops, or kept from the provider) are read from private storage and
 * verified; otherwise the provider's adapter is asked once and its PDF kept.
 */
export async function invoicePdf(identity: EvalIdentity, orgId: string, id: string, deps: { storePdf?: StorePdf; readPdf?: typeof readInvoicePdf } = {}) {
  await requireInvoiceOwner(identity, orgId);
  const document = await withTenant({ orgId, actorId: identity.user.id }, db => getDocument(db, orgId, id));
  if (!document || document.status !== "issued") throw new EvalError("INVOICE_NOT_FOUND", 404, "This invoice has not been issued yet.");
  let bytes: Uint8Array | null = null;
  if (document.pdf) {
    bytes = await (deps.readPdf ?? readInvoicePdf)(document.pdf);
  } else if (document.provider) {
    const adapter = createInvoicingAdapter(document.provider);
    bytes = adapter ? await adapter.fetchPdf(document) : null;
    if (bytes?.length) {
      checkInvoicePdf(bytes);
      const sealed = await (deps.storePdf ?? sealInvoicePdf)(document, bytes);
      await withTenant({ orgId, actorId: "system:billing-invoicing" }, db => issueDocument(db, {
        orgId, kind: document.kind, id: document.id, number: document.number!, issueDate: document.issueDate!, pdf: sealed,
      })).catch(async () => { await discardInvoicePdf(sealed.objectKey); });
    }
  }
  if (!bytes?.length) throw new EvalError("INVOICE_NOT_FOUND", 404, "The PDF of this invoice is not available yet.");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf", "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${pdfFileName(document)}"`, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/* ------------------------------------------------------------- admins --- */

const statusFilter = z.enum(["queued", "pending_issue", "issued", "voided"]).nullable();

/** GET /admin/invoices?status=&mode=test|live: documents across workspaces. Platform admins. */
export async function adminListInvoices(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const status = statusFilter.parse(params.get("status") || null);
  const mode = z.enum(["test", "live"]).nullable().parse(params.get("mode") || null);
  const limit = z.coerce.number().int().min(1).max(500).parse(params.get("limit") ?? 100);
  const documents = await withTenant({ orgId: "", actorId: identity.user.id }, db => adminDocuments(db, { status, livemode: mode === null ? null : mode === "live", limit }))
    .catch(invoicingApiError);
  return { documents };
}

const kind = z.enum(["invoice", "credit_note"]);
export const adminInvoiceInput = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("issue"), orgId: z.uuid(), kind,
    number: z.string().trim().min(3).max(60),
    issueDate: z.iso.date(),
    pdfBase64: z.string().min(80).max(Math.ceil(MAX_INVOICE_PDF_BYTES / 3) * 4 + 4),
    verifactuStatus: z.enum(["not_applicable", "pending", "accepted", "accepted_with_errors", "rejected"]).nullish(),
    reason: z.string().trim().min(3).max(2000),
  }),
  z.strictObject({ action: z.literal("void"), orgId: z.uuid(), kind, reason: z.string().trim().min(3).max(2000) }),
]);
export type AdminInvoiceInput = z.infer<typeof adminInvoiceInput>;

function idempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "Idempotency-Key required.");
  return key;
}

function decodePdf(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new InvoicePdfError("PDF_INVALID");
  const bytes = Buffer.from(base64, "base64");
  checkInvoicePdf(bytes);
  return bytes;
}

/**
 * POST /admin/invoices/:id. "issue": records the number, issue date and PDF the
 * accountant issued (the number must fit the series; never made up here), then
 * emails the billing contact once. "void": Stripe test-mode documents only.
 */
export async function adminInvoiceAction(request: Request, identity: EvalIdentity, id: string, body: AdminInvoiceInput,
  deps: { storePdf?: StorePdf; sendEmail?: typeof sendInvoiceAvailable } = {}) {
  requireRecentAuthentication(identity);
  const key = idempotencyKey(request);
  const documentId = z.uuid().parse(id);
  const scope = { orgId: body.orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  const target = { orgId: body.orgId, kind: body.kind as DocumentKind, id: documentId };
  try {
    const current = await withTenant(scope, db => getDocument(db, body.orgId, documentId, body.kind));
    if (!current) throw new InvoicingError("INVOICE_NOT_FOUND");
    if (body.action === "void") {
      const voided = await withTenant(scope, db => idempotent(db, scope, "billing-admin-invoices", key, { id: documentId, ...body }, async () =>
        documentView(await voidDocument(db, { ...target, reason: body.reason, requestId }))));
      return voided;
    }
    if (!numberFitsDocument(body.number, current)) throw new InvoicingError("INVOICE_NUMBER_INVALID");
    const pdf = decodePdf(body.pdfBase64);
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const payload = { id: documentId, action: body.action, orgId: body.orgId, kind: body.kind, number: body.number, issueDate: body.issueDate,
      pdfSha256: sha256, verifactuStatus: body.verifactuStatus ?? null, reason: body.reason };
    // A replay of what is recorded needs no new object in storage.
    const replay = current.status === "issued" && current.number === body.number && current.issueDate === body.issueDate && current.pdf?.sha256 === sha256;
    const sealed = replay ? null : await (deps.storePdf ?? sealInvoicePdf)(current, pdf);
    let issued: InvoiceDocument;
    try {
      issued = await withTenant(scope, db => idempotent(db, scope, "billing-admin-invoices", key, payload, async () =>
        issueDocument(db, { ...target, number: body.number, issueDate: body.issueDate, verifactuStatus: body.verifactuStatus ?? null,
          pdf: sealed ?? current.pdf, reason: body.reason, requestId })));
    } catch (error) {
      if (sealed) await discardInvoicePdf(sealed.objectKey);
      throw error;
    }
    const document = await withTenant(scope, db => getDocument(db, body.orgId, documentId, body.kind)) ?? issued;
    const email = await (deps.sendEmail ?? sendInvoiceAvailable)(document, pdf);
    return { ...documentView(document), email };
  } catch (error) {
    return invoicingApiError(error);
  }
}
