import { z } from "zod";

/**
 * Opt-in public results pages and the anonymous sector index (launch L-31;
 * spec v2 P-23, P-53, D-16). Shared, dependency-free contracts: the consent
 * input, the frozen public projections the database returns, and the paths.
 *
 * Nothing is published automatically. An owner records written consent in
 * the app; the founder reviews the page by hand and publishes it with
 * `scripts/evals/public-results.ts`; the public site shows it only while
 * PUBLIC_RESULTS_ENABLED=true and the consent stands (migration 104).
 */

/**
 * The version of the consent wording an owner signs (the `publicResultsConsent*`
 * messages in lib/evals/messages). Pending legal review (decision I-2): a
 * reworded consent gets a new date here, and earlier consents keep theirs.
 */
export const CONSENT_VERSION = "2026-10-14";

/**
 * Sectors an anonymous index edition can cover: the workspace sectors of
 * launch L-25 without "other", which is not a sector.
 */
export const INDEX_SECTORS = ["fiscal_accounting_payroll", "legal", "hr", "insurance", "energy", "telco", "travel"] as const;
export type IndexSector = (typeof INDEX_SECTORS)[number];
export const isIndexSector = (value: unknown): value is IndexSector => typeof value === "string" && (INDEX_SECTORS as readonly string[]).includes(value);

/** Fewer systems than this in a sector and quarter: the sector is not published. */
export const MIN_COHORT = 10;
/** A system counts in the index only with at least this many scored answers. */
export const MIN_SCORED_PER_SYSTEM = 5;
/** A public results page needs at least this many scored answers (and a complete headline). */
export const MIN_SCORED_FOR_PAGE = 10;
/** The index methodology revision recorded on every edition. */
export const INDEX_METHODOLOGY_VERSION = "sector-index-v1";

/** Internal, locale-free paths (`/es/resultados/<slug>`, `/es/indice-sectorial/<quarter>`). */
export const RESULTS_PATH = "/results";
export const SECTOR_INDEX_PATH = "/sector-index";

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isResultSlug = (value: string) => SLUG_PATTERN.test(value) && value.length >= 3 && value.length <= 80;

/** Quarter as stored (`2026-Q4`) and as it appears in a URL (`2026-q4`). */
export const QUARTER_PATTERN = /^[0-9]{4}-Q[1-4]$/;
export function quarterFromParam(value: string): string | null {
  const quarter = value.toUpperCase();
  return /^[0-9]{4}-q[1-4]$/.test(value) && QUARTER_PATTERN.test(quarter) ? quarter : null;
}
export const quarterParam = (quarter: string) => quarter.toLowerCase();
/** The quarter a date falls in (Europe/Madrid is within an hour of UTC; edges are a script argument anyway). */
export function quarterOf(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/* ------------------------------------------------------ consent input --- */

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const consentInputSchema = z
  .strictObject({
    orgId: z.uuid(),
    revisionId: z.uuid(),
    resultsPage: z.boolean(),
    sectorIndex: z.boolean(),
    publicName: text(2, 120).optional(),
    scopeSummary: text(10, 400).optional(),
    indexSector: z.enum(INDEX_SECTORS).optional(),
    signerName: text(2, 120),
    signerRole: text(2, 120),
    version: z.literal(CONSENT_VERSION),
    locale: z.enum(["en", "es"]),
    accepted: z.literal(true),
    requestId: z.string().min(8).max(200),
  })
  .refine((value) => value.resultsPage || value.sectorIndex, { message: "Choose at least one use.", path: ["resultsPage"] })
  .refine((value) => !value.resultsPage || (value.publicName && value.scopeSummary), { message: "Name and scope are required for a public page.", path: ["publicName"] })
  .refine((value) => !value.sectorIndex || value.indexSector, { message: "Choose the sector.", path: ["indexSector"] });
export type ConsentInput = z.infer<typeof consentInputSchema>;

export const revokeInputSchema = z.strictObject({
  orgId: z.uuid(),
  consentId: z.uuid(),
  reason: text(1, 500).optional(),
});

/** What an owner sees about one revision's consent and page. */
export type PublicationConsentView = {
  id: string;
  revisionId: string;
  resultsPage: boolean;
  sectorIndex: boolean;
  publicName: string | null;
  scopeSummary: string | null;
  indexSector: IndexSector | null;
  version: string;
  method: "in_app" | "signed_document";
  signer: { name: string; role: string };
  signedAt: string;
  revokedAt: string | null;
  /** The founder's publication of this consent, if any. */
  page: { slug: string; publishedAt: string; unpublishedAt: string | null } | null;
};

export type PublicationStatus = {
  /** Only owners record or revoke consent; operators and admins read. */
  canConsent: boolean;
  version: string;
  /** The workspace's sector (launch L-25), to preselect the index sector. */
  workspaceSector: IndexSector | null;
  /** Consents for this report, newest first (standing and revoked). */
  consents: PublicationConsentView[];
};

/* --------------------------------------------------- public projections --- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

/** The frozen fields of a public results page (evals.publish_result_page). */
export const resultProjectionSchema = z.strictObject({
  schema: z.literal(1),
  public_name: z.string().min(2).max(120),
  scope_summary: z.string().min(10).max(400),
  tested_from: isoDate,
  tested_to: isoDate,
  languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)).max(10),
  questions: count,
  scored: count,
  correct: count,
  partial: count,
  incorrect: count,
  not_scored: count,
  pass_rate: rate,
  interval_low: rate.optional(),
  interval_high: rate.optional(),
  review_status: z.enum(["preliminary", "reviewed"]),
  expert_reviewers: z.number().int().positive().optional(),
  expert_reviewed_on: isoDate.optional(),
  scorer_version: z.string().max(60).optional(),
  report_published_at: isoDate,
  consented_on: isoDate,
});
export type ResultProjection = z.infer<typeof resultProjectionSchema>;
export type PublicResultPage = { slug: string; projection: ResultProjection; publishedAt: string };

const percent = z.number().int().min(0).max(100);
/** One sector of an index edition: whole percentages and counts, nothing else. */
export const sectorAggregatesSchema = z.strictObject({
  systems: z.number().int().min(MIN_COHORT),
  answers_scored: count,
  median_pass: percent,
  p25_pass: percent,
  p75_pass: percent,
  correct_share: percent,
  partial_share: percent,
  incorrect_share: percent,
});
export type SectorAggregates = z.infer<typeof sectorAggregatesSchema>;
export type PublicSectorRow = {
  sector: IndexSector;
  cohortSize: number;
  aggregates: SectorAggregates;
  methodologyVersion: string;
  legalSignedOn: string;
  publishedAt: string;
};
export type PublicSectorIndex = { quarter: string; rows: PublicSectorRow[] };
