/**
 * Versions of the published legal documents.
 *
 * Each version is the date its text took effect (YYYY-MM-DD). The page shows it
 * as "Last updated", and an acceptance record (`evals.terms_acceptance`,
 * migration 081) stores the version the person saw. Bump a document's version
 * whenever its text changes in a way that matters, and never reuse one.
 *
 * `review` is internal and never rendered: `pending_legal_review` means the
 * text has not yet been reviewed by a lawyer (launch decision I-2). Gate B
 * cannot pass while any document that customers accept is still pending.
 */

export const LEGAL_DOCUMENT_IDS = [
  "terms",
  "privacy",
  "dpa",
  "subprocessors",
  "security",
  "cookies",
  "notice",
] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENT_IDS)[number];

export type LegalReviewStatus = "pending_legal_review" | "reviewed";

export const LEGAL_DOCUMENT_VERSIONS: Record<
  LegalDocumentId,
  { version: string; review: LegalReviewStatus }
> = {
  terms: { version: "2026-10-11", review: "pending_legal_review" },
  privacy: { version: "2026-10-11", review: "pending_legal_review" },
  dpa: { version: "2026-10-11", review: "pending_legal_review" },
  subprocessors: { version: "2026-10-11", review: "pending_legal_review" },
  security: { version: "2026-10-11", review: "pending_legal_review" },
  cookies: { version: "2026-03-01", review: "pending_legal_review" },
  notice: { version: "2026-10-11", review: "pending_legal_review" },
};

/** Internal (locale-free) path of each document's page. */
export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentId, string> = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  dpa: "/legal/dpa",
  subprocessors: "/legal/subprocessors",
  security: "/legal/security",
  cookies: "/legal/cookies",
  notice: "/legal/notice",
};

/**
 * Documents a person can accept, and where they accept them. The database
 * stores both as checked text (migration 081), so a later package adds a value
 * here without a schema change: checkout (L-12) records `terms` and `privacy`
 * with context `checkout`; the DPA click-through (L-30) records `dpa` with
 * context `dpa`.
 */
export const ACCEPTABLE_DOCUMENTS = ["terms", "privacy", "dpa"] as const;
export type AcceptableDocument = (typeof ACCEPTABLE_DOCUMENTS)[number];

export const ACCEPTANCE_CONTEXTS = ["signup", "checkout", "dpa"] as const;
export type AcceptanceContext = (typeof ACCEPTANCE_CONTEXTS)[number];

/** What a sign-up accepts: the current Terms and Privacy versions. */
export function signupAcceptance(): { document: AcceptableDocument; version: string }[] {
  return (["terms", "privacy"] as const).map((document) => ({
    document,
    version: LEGAL_DOCUMENT_VERSIONS[document].version,
  }));
}

export function legalDocumentVersion(id: LegalDocumentId): string {
  return LEGAL_DOCUMENT_VERSIONS[id].version;
}

/**
 * Published file name of the DPA template for a locale, served by
 * `app/legal/[file]/route.ts` at `/legal/<name>`.
 */
export function dpaTemplateFileName(locale: "en" | "es") {
  return `caudals-dpa-${locale}.docx`;
}
