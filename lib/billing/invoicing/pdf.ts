/**
 * Invoice PDFs in private storage (launch L-13). A PDF the accountant issued
 * (attached by ops) or a provider returned is sealed under a fresh key
 * (evals/<workspace>/<document>/sealed/<uuid>, written once) and recorded on
 * the document with its SHA-256 and size; reads verify both.
 */
import "server-only";
import { createHash } from "node:crypto";
import { deletePrivateObject, objectKey, readVerified, sealObject } from "@/lib/evals/storage/private";
import type { StoredPdf } from "./index";

export const MAX_INVOICE_PDF_BYTES = 5 * 1024 * 1024;

export class InvoicePdfError extends Error {
  constructor(readonly code: "PDF_INVALID" | "PDF_TOO_LARGE") { super(code); this.name = "InvoicePdfError"; }
}

/** A PDF file: the %PDF- header, at most 5 MiB. */
export function checkInvoicePdf(bytes: Uint8Array) {
  if (bytes.length > MAX_INVOICE_PDF_BYTES) throw new InvoicePdfError("PDF_TOO_LARGE");
  if (bytes.length < 64 || Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new InvoicePdfError("PDF_INVALID");
}

export type SealedPdf = { objectKey: string; sha256: string; byteSize: number };
export type StorePdf = (document: { orgId: string; id: string }, bytes: Uint8Array) => Promise<SealedPdf>;

export const sealInvoicePdf: StorePdf = async (document, bytes) => {
  checkInvoicePdf(bytes);
  const key = objectKey(document.orgId, document.id, true);
  const body = Buffer.from(bytes);
  await sealObject(key, body, "application/pdf");
  return { objectKey: key, sha256: createHash("sha256").update(body).digest("hex"), byteSize: body.length };
};

export function readInvoicePdf(pdf: Pick<StoredPdf, "objectKey" | "byteSize" | "sha256">): Promise<Buffer> {
  return readVerified(pdf.objectKey, pdf.byteSize, pdf.sha256);
}

/** Removes a sealed PDF that was never recorded (the database refused the document). Best effort. */
export async function discardInvoicePdf(key: string) {
  try { await deletePrivateObject(key); } catch { console.error(JSON.stringify({ event: "billing_invoice_pdf_discard_failed" })); }
}
