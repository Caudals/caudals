/** Invoicing errors (launch L-13). Kept apart from ./index so adapters import them without a cycle. */

/** A provider failure. Retryable ones stay queued with a backoff; the code is stored (a-z, 0-9, _). */
export class InvoicingProviderError extends Error {
  constructor(readonly code: string, readonly retryable = true) { super(code); this.name = "InvoicingProviderError"; }
}

export const INVOICING_ERROR_CODES = [
  "INVOICE_NOT_FOUND", "INVOICE_NUMBER_INVALID", "INVOICE_NUMBER_TAKEN", "INVOICE_ALREADY_ISSUED", "INVOICE_VOIDED", "INVOICE_VOID_LIVE",
  "ISSUE_DATE_INVALID", "ORIGINAL_NOT_ISSUED", "INPUT_INVALID", "SCOPE_DENIED", "REASON_REQUIRED",
] as const;
export type InvoicingErrorCode = typeof INVOICING_ERROR_CODES[number];

/** A refusal from the 092 database functions. */
export class InvoicingError extends Error {
  constructor(readonly code: InvoicingErrorCode) { super(code); this.name = "InvoicingError"; }
}
