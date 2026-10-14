import "server-only";

import { EvalError } from "@/lib/evals/domain/errors";
import { withTenant } from "@/lib/evals/repositories/db";
import {
  CONSENT_VERSION,
  isIndexSector,
  isResultSlug,
  QUARTER_PATTERN,
  resultProjectionSchema,
  sectorAggregatesSchema,
  type ConsentInput,
  type IndexSector,
  type PublicationConsentView,
  type PublicationStatus,
  type PublicResultPage,
  type PublicSectorIndex,
} from "./contracts";

/**
 * Consent records and public reads for launch L-31 (migration 104). Every
 * write is a SECURITY DEFINER function that checks the caller in SQL (owner
 * for an in-app consent or a revocation, platform administrator for the
 * founder's publication steps) and writes the audit trail. The public site
 * reads only the frozen projections of live rows.
 */

type Scope = { orgId: string; actorId: string };

function domainError(error: unknown): never {
  if (error instanceof EvalError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || message === "SESSION_REQUIRED") throw new EvalError("SCOPE_DENIED", 404, "Not found.");
  if (message === "OWNER_REQUIRED") throw new EvalError("OWNER_REQUIRED", 403, "Only a workspace owner can give or withdraw this consent.");
  if (message === "PUBLICATION_NOT_ALLOWED") throw new EvalError("PUBLICATION_NOT_ALLOWED", 422, "This report cannot be published.");
  if (message === "REPORT_NOT_PUBLISHED") throw new EvalError("REPORT_NOT_PUBLISHED", 409, "Publish this report before giving consent.");
  if (message === "CONSENT_EXISTS") throw new EvalError("CONSENT_EXISTS", 409, "This revision already has a consent. Withdraw it before giving a new one.");
  if (message === "INPUT_INVALID") throw new EvalError("INPUT_INVALID", 422, "Check the supplied fields.");
  throw error;
}

const iso = (value: Date | string) => new Date(value).toISOString();

type ConsentRow = {
  id: string; report_revision_id: string; results_page: boolean; sector_index: boolean; public_name: string | null;
  scope_summary: string | null; index_sector: string | null; consent_version: string; method: "in_app" | "signed_document";
  signer_name: string; signer_role: string; signed_at: Date; revoked_at: Date | null;
  slug: string | null; published_at: Date | null; unpublished_at: Date | null;
};

const view = (row: ConsentRow): PublicationConsentView => ({
  id: row.id,
  revisionId: row.report_revision_id,
  resultsPage: row.results_page,
  sectorIndex: row.sector_index,
  publicName: row.public_name,
  scopeSummary: row.scope_summary,
  indexSector: isIndexSector(row.index_sector) ? row.index_sector : null,
  version: row.consent_version,
  method: row.method,
  signer: { name: row.signer_name, role: row.signer_role },
  signedAt: iso(row.signed_at),
  revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  page: row.slug && row.published_at ? { slug: row.slug, publishedAt: iso(row.published_at), unpublishedAt: row.unpublished_at ? iso(row.unpublished_at) : null } : null,
});

async function readStatus(db: import("pg").PoolClient, scope: Scope, reportId: string): Promise<PublicationStatus> {
  const role = (await db.query<{ role: string }>("SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2", [scope.orgId, scope.actorId])).rows[0]?.role;
  // Row-level security limits these to owners, workspace operators and platform administrators.
  const { rows } = await db.query<ConsentRow>(
    `SELECT c.id, c.report_revision_id, c.results_page, c.sector_index, c.public_name, c.scope_summary, c.index_sector, c.consent_version,
            c.method, c.signer_name, c.signer_role, c.signed_at, c.revoked_at, p.slug, p.published_at, p.unpublished_at
       FROM evals.publication_consent c LEFT JOIN evals.public_result_page p ON (p.org_id, p.consent_id) = (c.org_id, c.id)
      WHERE c.org_id=$1 AND c.report_id=$2 ORDER BY c.recorded_at DESC, c.id DESC LIMIT 50`,
    [scope.orgId, reportId],
  );
  const sector = (await db.query<{ sector: string | null }>("SELECT sector FROM evals.workspace_library_setting WHERE org_id=$1", [scope.orgId])).rows[0]?.sector;
  return {
    canConsent: role === "owner",
    version: CONSENT_VERSION,
    workspaceSector: isIndexSector(sector) ? (sector as IndexSector) : null,
    consents: rows.map(view),
  };
}

async function requireReport(db: import("pg").PoolClient, scope: Scope, reportId: string) {
  const found = await db.query("SELECT 1 FROM evals.report WHERE org_id=$1 AND id=$2", [scope.orgId, reportId]);
  if (!found.rowCount) throw new EvalError("SCOPE_DENIED", 404, "Not found.");
}

/** The report's consents and pages, for its owners and workspace operators. */
export function getPublicationStatus(scope: Scope, reportId: string): Promise<PublicationStatus> {
  return withTenant(scope, async (db) => {
    await requireReport(db, scope, reportId);
    return readStatus(db, scope, reportId);
  });
}

/** An owner's written consent for one published revision of this report (idempotent per request id). */
export function recordConsent(scope: Scope, reportId: string, input: ConsentInput): Promise<PublicationStatus> {
  return withTenant(scope, async (db) => {
    await requireReport(db, scope, reportId);
    const revision = await db.query("SELECT 1 FROM evals.report_revision WHERE org_id=$1 AND id=$2 AND report_id=$3", [scope.orgId, input.revisionId, reportId]);
    if (!revision.rowCount) throw new EvalError("SCOPE_DENIED", 404, "Not found.");
    try {
      await db.query("SAVEPOINT publication_consent");
      await db.query(
        `SELECT id FROM evals.record_publication_consent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'in_app')`,
        [scope.orgId, input.revisionId, input.resultsPage, input.sectorIndex, input.resultsPage ? input.publicName : null,
          input.resultsPage ? input.scopeSummary : null, input.sectorIndex ? input.indexSector : null, input.signerName, input.signerRole,
          input.version, input.locale, input.requestId],
      );
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT publication_consent");
      domainError(error);
    }
    return readStatus(db, scope, reportId);
  });
}

/** Withdraws a consent; its public page, if any, is taken down in the same transaction. */
export function revokeConsent(scope: Scope, reportId: string, consentId: string, reason: string | null): Promise<PublicationStatus> {
  return withTenant(scope, async (db) => {
    await requireReport(db, scope, reportId);
    const consent = await db.query("SELECT 1 FROM evals.publication_consent WHERE org_id=$1 AND id=$2 AND report_id=$3", [scope.orgId, consentId, reportId]);
    if (!consent.rowCount) throw new EvalError("SCOPE_DENIED", 404, "Not found.");
    try {
      await db.query("SAVEPOINT publication_revoke");
      await db.query("SELECT id FROM evals.revoke_publication_consent($1,$2,$3)", [scope.orgId, consentId, reason]);
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT publication_revoke");
      domainError(error);
    }
    return readStatus(db, scope, reportId);
  });
}

/* --------------------------------------------------------- public reads --- */

const PUBLIC_SCOPE = { orgId: "", actorId: "public:results" };

/** A live public results page, or null (unknown, taken down, consent withdrawn, workspace deleted). */
export async function getPublicResultPage(slug: string): Promise<PublicResultPage | null> {
  if (!isResultSlug(slug)) return null;
  const row = await withTenant(PUBLIC_SCOPE, async (db) =>
    (await db.query<{ slug: string; projection: unknown; published_at: Date }>("SELECT slug, projection, published_at FROM evals.public_result_page_view($1)", [slug])).rows[0],
  );
  if (!row) return null;
  const projection = resultProjectionSchema.safeParse(row.projection);
  if (!projection.success) {
    console.error("public_result_projection_invalid", { slug: row.slug });
    return null;
  }
  return { slug: row.slug, projection: projection.data, publishedAt: iso(row.published_at) };
}

/** A quarter's live, signed-off index sectors, or null when there are none. */
export async function getPublicSectorIndex(quarter: string): Promise<PublicSectorIndex | null> {
  if (!QUARTER_PATTERN.test(quarter)) return null;
  const rows = await withTenant(PUBLIC_SCOPE, async (db) =>
    (await db.query<{ sector: string; cohort_size: number; aggregates: unknown; methodology_version: string; legal_signed_on: string; published_at: Date }>(
      "SELECT sector, cohort_size, aggregates, methodology_version, to_char(legal_signed_on, 'YYYY-MM-DD') AS legal_signed_on, published_at FROM evals.public_sector_index($1)",
      [quarter],
    )).rows,
  );
  const parsed = rows.flatMap((row) => {
    const aggregates = sectorAggregatesSchema.safeParse(row.aggregates);
    if (!aggregates.success || !isIndexSector(row.sector) || aggregates.data.systems !== row.cohort_size) return [];
    return [{ sector: row.sector, cohortSize: row.cohort_size, aggregates: aggregates.data, methodologyVersion: row.methodology_version, legalSignedOn: row.legal_signed_on, publishedAt: iso(row.published_at) }];
  });
  return parsed.length ? { quarter, rows: parsed } : null;
}
