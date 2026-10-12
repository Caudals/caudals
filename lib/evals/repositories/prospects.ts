import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import {
  checkSnapshotPolicy, madridDay, outreachDrafts, publicUrl, SNAPSHOT_PACKS, snapshotLimits, snapshotMetrics, snapshotScope,
  snapshotShareExpiry, weakEvidence, type TestingBasis,
} from "../prospects/policy";
import { withTenant } from "./db";
import { addTarget, createProject, createWebsiteSource, type EvidenceScope } from "./evidence";
import { createEvaluation, createShare, revokeShare } from "./managed";
import { queueWebsiteConnectionCheck } from "./stage-c";

/**
 * Prospect snapshots (launch L-21, spec v2 P-35): an operator pastes a public
 * chat URL and a help-centre URL; this creates a sandbox workspace with the
 * basis record and limits (migration 090), then the evaluation, the website
 * system, its testing basis and the help centre as reference material. The
 * normal engine prepares the questions; the operator approves and runs them,
 * then makes a 30-day "external snapshot" link and edits the outreach text.
 * Nothing here contacts anyone.
 */
export function prospectSnapshotsEnabled() {
  return process.env.PROSPECT_SNAPSHOTS_ENABLED === "true";
}

/** Platform operators and admins with the flag on; everyone else gets a 404. */
export function requireSnapshotOperator(identity: EvalIdentity) {
  if (!prospectSnapshotsEnabled() || !identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
}

export type ProspectInput = {
  company: string;
  chatUrl: string;
  helpUrl: string;
  locale: "en" | "es";
  basis: TestingBasis;
  basisNote?: string;
  packId?: string;
};

/** A UUID derived from a seed, so a retried setup step replays the same payload. */
export function stableUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const DB_ERRORS: Record<string, [string, number, string]> = {
  SNAPSHOT_DAILY_CAP: ["SNAPSHOT_DAILY_CAP", 429, "Today's snapshot limit is reached. Try again tomorrow (Madrid time)."],
  SNAPSHOT_HOST_LIMIT: ["SNAPSHOT_HOST_LIMIT", 429, "This chat already has a snapshot from the last 24 hours."],
  IDEMPOTENCY_CONFLICT: ["VERSION_CONFLICT", 409, "Idempotency key payload mismatch"],
  SCOPE_DENIED: ["SCOPE_DENIED", 404, "This action is not available."],
  INPUT_INVALID: ["INPUT_INVALID", 422, "Check the supplied fields."],
};
function mapDbError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  const known = DB_ERRORS[message];
  if (known) throw new EvalError(known[0], known[1], known[2]);
  throw error;
}

type SnapshotRow = {
  id: string; org_id: string; company: string; target_url: string; target_host: string; help_url: string; help_host: string;
  locale: "en" | "es"; testing_basis: TestingBasis; basis_note: string | null; scope: Record<string, unknown>; traffic_limit: Record<string, number>;
  project_id: string | null; evaluation_id: string | null; target_id: string | null; share_id: string | null; share_expires_at: Date | null;
  shared_at: Date | null; crm_draft_id: string | null; madrid_day: string; created_by: string; created_at: Date; updated_at: Date;
};

async function snapshotRow(identity: EvalIdentity, id: string): Promise<SnapshotRow> {
  const row = await withTenant({ orgId: "", actorId: identity.user.id }, async (db) =>
    (await db.query("SELECT * FROM evals.prospect_snapshot WHERE id=$1", [id])).rows[0] as SnapshotRow | undefined);
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  return row;
}

/** Record the snapshot's testing basis for its website system (evals spec §16.5). */
async function recordSnapshotBasis(scope: EvidenceScope, snapshot: SnapshotRow, projectId: string, targetId: string, endpoint: string) {
  return withTenant(scope, async (db) => {
    const existing = (await db.query("SELECT id FROM evals.authorization_record WHERE org_id=$1 AND target_id=$2 AND basis='external_snapshot' LIMIT 1", [scope.orgId, targetId])).rows[0];
    if (existing) return existing.id as string;
    return (await db.query(
      `INSERT INTO evals.authorization_record(org_id,project_id,target_id,basis,scope,traffic_limit,expires_at)
       VALUES($1,$2,$3,'external_snapshot',$4,$5,now()+interval '100 years') RETURNING id`,
      [scope.orgId, projectId, targetId,
        { endpoint, activity: "external_snapshot_ordinary_questions", adversarial: false, testing_basis: snapshot.testing_basis,
          help_centre: snapshot.help_url, sharing: "private_link", public_naming: false },
        { requests_per_minute: snapshot.traffic_limit.requests_per_minute, concurrent_sessions: 1 }],
    )).rows[0].id as string;
  });
}

export async function createProspectSnapshot(identity: EvalIdentity, input: ProspectInput, key: string) {
  requireSnapshotOperator(identity);
  if (!key || key.length < 8 || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "Idempotency-Key required");
  const packId = input.packId ?? SNAPSHOT_PACKS[0];
  const policy = checkSnapshotPolicy({ packId });
  if (!policy.allowed) {
    throw new EvalError("SNAPSHOT_POLICY_BLOCKED", 422, "Snapshots use ordinary questions only. Adversarial or unlisted question packs are blocked.");
  }
  const chat = publicUrl(input.chatUrl);
  const help = publicUrl(input.helpUrl);
  if (!chat || !help) throw new EvalError("INPUT_INVALID", 422, "Use public https pages, without a login, port or private address.");
  const limits = snapshotLimits();
  const traffic = { requests_per_minute: limits.requestsPerMinute, concurrent_sessions: 1, max_questions: limits.maxQuestions, runs_per_month: limits.runsPerMonth };
  const created = await withTenant({ orgId: "", actorId: identity.user.id }, async (db) => {
    try {
      return (await db.query(
        "SELECT id,org_id,created FROM evals.create_prospect_snapshot($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [key, input.company.trim(), chat.url, chat.host, help.url, help.host, input.locale, input.basis, input.basisNote?.trim() || null,
          snapshotScope({ packId, maxQuestions: limits.maxQuestions }), traffic, limits.dailyCap],
      )).rows[0] as { id: string; org_id: string; created: boolean };
    } catch (error) {
      mapDbError(error);
    }
  });
  return completeSnapshotSetup(identity, created.id);
}

/**
 * The sandbox's evaluation, website system, testing basis and reference
 * material. Every step is idempotent, so a retry after a failure (or a replay
 * of the creation request) finishes the setup without duplicates.
 */
export async function completeSnapshotSetup(identity: EvalIdentity, snapshotId: string) {
  const snapshot = await snapshotRow(identity, snapshotId);
  const scope = { orgId: snapshot.org_id, actorId: identity.user.id };
  const step = (part: string) => `prospect-${snapshot.id}-${part}`;
  const es = snapshot.locale === "es";
  const title = es ? `${snapshot.company} · prueba externa` : `${snapshot.company} · external snapshot`;
  const project = await createProject(scope, {
    title,
    description: es
      ? `Preguntas normales al chat público de ${snapshot.target_host} con información pública de ${snapshot.help_host}.`
      : `Ordinary questions to the public chat at ${snapshot.target_host}, using public information from ${snapshot.help_host}.`,
  }, step("project")) as { id: string };
  const endpoint = snapshot.target_url;
  const limits = { max_turns: 10, max_output_tokens: 4_000, max_tool_calls: 0, timeout_ms: 120_000, repetitions: 1 };
  const target = await addTarget(scope, project.id, {
    title: snapshot.target_host,
    config: {
      schema_version: "1.0", target_revision_id: stableUuid(`${snapshot.id}:target`), limits,
      requests_per_minute: snapshot.traffic_limit.requests_per_minute, concurrent_sessions: 1, reset: "fresh_session",
      kind: "website", endpoint, recipe_revision_id: null, login_session_id: null,
    },
  }, step("target")) as { id: string; target_id: string };
  await recordSnapshotBasis(scope, snapshot, project.id, target.target_id, endpoint);
  await queueWebsiteConnectionCheck(scope, target.id, step("check"));
  // The website system is preselected for the evaluation's runs.
  const evaluation = await createEvaluation(scope, {
    projectId: project.id, title, evidencePolicy: "source_grounded", commercialCap: "50", currency: "EUR", targetId: target.target_id,
  }, step("evaluation")) as { id: string };
  await createWebsiteSource(scope, {
    evaluationId: evaluation.id, projectId: project.id, url: snapshot.help_url,
    title: es ? `Centro de ayuda público de ${snapshot.help_host}` : `${snapshot.help_host} public help centre`,
    // The rights enum has no "public third-party" value; customer_owned keeps
    // public release blocked (projections.ts). The real basis is on the snapshot.
    rights: "customer_owned", pageLimit: snapshotLimits().helpPages,
  }, step("source"));
  await withTenant({ orgId: "", actorId: identity.user.id }, (db) => db.query(
    "UPDATE evals.prospect_snapshot SET project_id=$2,evaluation_id=$3,target_id=$4,updated_at=now() WHERE id=$1 AND evaluation_id IS NULL",
    [snapshot.id, project.id, evaluation.id, target.target_id]));
  return { id: snapshot.id, orgId: snapshot.org_id, evaluationId: evaluation.id };
}

export async function listProspectSnapshots(identity: EvalIdentity) {
  requireSnapshotOperator(identity);
  const limits = snapshotLimits();
  return withTenant({ orgId: "", actorId: identity.user.id }, async (db) => {
    const rows = (await db.query(
      `SELECT s.id,s.org_id AS "orgId",s.company,s.target_host AS "targetHost",s.help_host AS "helpHost",s.testing_basis AS "testingBasis",
        s.locale,s.evaluation_id AS "evaluationId",s.share_id IS NOT NULL AS shared,COALESCE(s.share_expires_at>now(),false) AS "shareActive",s.share_expires_at AS "shareExpiresAt",
        s.crm_draft_id IS NOT NULL AS "crmDraft",s.created_at AS "createdAt",s.created_by=$1 AS mine
       FROM evals.prospect_snapshot s ORDER BY s.created_at DESC,s.id LIMIT 100`, [identity.user.id])).rows;
    const today = (await db.query("SELECT created FROM evals.prospect_snapshot_day WHERE day=$1", [madridDay()])).rows[0];
    return { snapshots: rows, today: { created: Number(today?.created ?? 0), cap: limits.dailyCap }, limits };
  });
}

const SEVERITY = ["critical", "high", "medium", "low"];

async function currentReport(db: PoolClient, snapshot: SnapshotRow) {
  if (!snapshot.project_id) return null;
  return (await db.query(
    `SELECT r.id,r.current_revision_id AS "revisionId",rr.review_status AS "reviewStatus",rr.snapshot->'metrics' AS metrics,
       rr.snapshot->'findings' AS findings,r.updated_at AS "publishedAt"
     FROM evals.report r JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id)
     JOIN evals.run x ON (x.org_id,x.id)=(rr.org_id,rr.run_id)
     WHERE r.org_id=$1 AND r.project_id=$2 AND x.evaluation_id=$3 AND r.publication_status='published' AND r.archived_at IS NULL
     ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`, [snapshot.org_id, snapshot.project_id, snapshot.evaluation_id])).rows[0] as
    { id: string; revisionId: string; reviewStatus: string; metrics: Record<string, unknown> | null; findings: Array<{ title: string; severity: string }> | null; publishedAt: Date } | undefined ?? null;
}

/** The most severe finding's title, for "for example: …" in the outreach. */
export function leadingFinding(findings: Array<{ title?: string; severity?: string }> | null | undefined) {
  const sorted = [...(findings ?? [])].filter((item) => item.title).sort((a, b) => SEVERITY.indexOf(a.severity ?? "low") - SEVERITY.indexOf(b.severity ?? "low"));
  return sorted[0]?.title ?? null;
}

export async function getProspectSnapshot(identity: EvalIdentity, id: string) {
  requireSnapshotOperator(identity);
  const snapshot = await snapshotRow(identity, id);
  return withTenant({ orgId: snapshot.org_id, actorId: identity.user.id }, async (db) => {
    const evaluation = snapshot.evaluation_id ? (await db.query(
      "SELECT id,title,preparation_status AS \"preparationStatus\",updated_at AS \"updatedAt\" FROM evals.evaluation WHERE org_id=$1 AND id=$2",
      [snapshot.org_id, snapshot.evaluation_id])).rows[0] ?? null : null;
    const connection = snapshot.target_id ? (await db.query(
      `SELECT c.status,c.created_at AS "checkedAt" FROM evals.connection_check c JOIN evals.target_revision tr ON (tr.org_id,tr.id)=(c.org_id,c.target_revision_id)
       WHERE c.org_id=$1 AND tr.target_id=$2 ORDER BY c.created_at DESC,c.id DESC LIMIT 1`, [snapshot.org_id, snapshot.target_id])).rows[0] ?? null : null;
    const source = snapshot.evaluation_id ? (await db.query(
      "SELECT status,page_limit AS \"pageLimit\" FROM evals.website_source_job WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
      [snapshot.org_id, snapshot.evaluation_id])).rows[0] ?? null : null;
    const run = snapshot.evaluation_id ? (await db.query(
      "SELECT id,status,phase,updated_at AS \"updatedAt\" FROM evals.run WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
      [snapshot.org_id, snapshot.evaluation_id])).rows[0] ?? null : null;
    const report = await currentReport(db, snapshot);
    const share = snapshot.share_id ? (await db.query(
      `SELECT g.id,g.expires_at AS "expiresAt",g.revoked_at AS "revokedAt",g.label,g.report_revision_id AS "revisionId",
        (SELECT count(*)::int FROM evals.share_access_event a WHERE a.org_id=g.org_id AND a.share_id=g.id AND a.action='view') AS views
       FROM evals.share_grant g WHERE g.org_id=$1 AND g.id=$2`, [snapshot.org_id, snapshot.share_id])).rows[0] ?? null : null;
    const crm = snapshot.crm_draft_id ? (await db.query(
      "SELECT id,summary,created_at AS \"createdAt\" FROM evals.crm_handoff_draft WHERE org_id=$1 AND id=$2", [snapshot.org_id, snapshot.crm_draft_id])).rows[0] ?? null : null;
    const metrics = snapshotMetrics(report?.metrics);
    const finding = leadingFinding(report?.findings);
    return {
      id: snapshot.id, orgId: snapshot.org_id, company: snapshot.company, targetUrl: snapshot.target_url, targetHost: snapshot.target_host,
      helpUrl: snapshot.help_url, helpHost: snapshot.help_host, locale: snapshot.locale, testingBasis: snapshot.testing_basis,
      basisNote: snapshot.basis_note, scope: snapshot.scope, trafficLimit: snapshot.traffic_limit, createdAt: snapshot.created_at,
      mine: snapshot.created_by === identity.user.id, projectId: snapshot.project_id, evaluationId: snapshot.evaluation_id,
      setupComplete: !!snapshot.evaluation_id,
      evaluation, connection, source, run,
      report: report ? { id: report.id, revisionId: report.revisionId, reviewStatus: report.reviewStatus, publishedAt: report.publishedAt, metrics, finding } : null,
      share: share ? { ...share, active: !share.revokedAt && new Date(share.expiresAt).getTime() > Date.now(), current: share.revisionId === report?.revisionId } : null,
      crmDraft: crm,
      weak: report ? weakEvidence(metrics) : null,
      outreach: report ? outreachDrafts({ company: snapshot.company, metrics, finding }) : null,
    };
  });
}

/**
 * The private link for the snapshot's current published report: a bearer
 * share labelled "external snapshot" that expires after 30 days (the database
 * enforces both). A new link replaces the previous one. The token is returned
 * once and never stored.
 */
export async function shareProspectSnapshot(identity: EvalIdentity, id: string, key: string) {
  requireSnapshotOperator(identity);
  const snapshot = await snapshotRow(identity, id);
  const scope = { orgId: snapshot.org_id, actorId: identity.user.id };
  const report = await withTenant(scope, (db) => currentReport(db, snapshot));
  if (!report) throw new EvalError("REPORT_NOT_READY", 409, "Publish the snapshot's report before making its link.");
  const share = await createShare(scope, {
    reportRevisionId: report.revisionId, audience: "bearer", expiresAt: snapshotShareExpiry().toISOString(),
    permittedFields: ["system", "scope", "metrics", "takeaways", "findings", "methodology", "results"],
  }, `prospect-share-${snapshot.id}-${key}`) as { id: string; token: string | null };
  if (snapshot.share_id && snapshot.share_id !== share.id) await revokeShare(scope, snapshot.share_id).catch(() => undefined);
  const saved = await withTenant(scope, async (db) => {
    const grant = (await db.query("SELECT expires_at,label FROM evals.share_grant WHERE org_id=$1 AND id=$2", [snapshot.org_id, share.id])).rows[0];
    if (!grant || grant.label !== "external_snapshot") throw new EvalError("SNAPSHOT_POLICY_BLOCKED", 409, "The link could not be labelled as an external snapshot.");
    await db.query("UPDATE evals.prospect_snapshot SET share_id=$2,share_expires_at=$3,shared_at=now(),updated_at=now() WHERE id=$1",
      [snapshot.id, share.id, grant.expires_at]);
    if (snapshot.share_id !== share.id) {
      await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'prospect_snapshot.shared',$3)", [snapshot.org_id, identity.user.id, share.id]);
    }
    return { expiresAt: grant.expires_at as Date };
  });
  return { shareId: share.id, token: share.token, expiresAt: saved.expiresAt, label: "external_snapshot" as const };
}
