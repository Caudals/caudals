import "server-only";

import type { PoolClient } from "pg";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { WORKSPACE_EXPORT_LINK_DAYS } from "../data-controls/flags";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import { ZipLimitError, ZipWriter, type ZipLimits } from "../exports/zip";
import { tv, type Locale } from "../messages/en";
import { renderReportDocument } from "../reports/document";
import { reportSnapshotSchema } from "../reports/contracts";
import { renderCefJsonl, renderResultsCsv } from "../reports/render";
import { withTenant } from "../repositories/db";
import { cefRecords } from "../repositories/managed";
import { deletePrivateObject, objectKey, openVerifiedStream, sealObject } from "../storage/private";
import { captureServerError } from "../../observability/capture";

/**
 * "Export all workspace data" (launch L-32, spec P-44). An owner asks; the
 * scheduler builds one ZIP in the background (tickWorkspaceExports) with every
 * kept report (readable HTML in the requester's language, the snapshot JSON,
 * the results CSV and the CEF evidence bundle of each revision), every test
 * set version and every run as CEF JSONL (questions, answers and grades), and
 * an index of systems and sources. The file is sealed in private storage, can
 * be downloaded by owners for WORKSPACE_EXPORT_LINK_DAYS and is then deleted
 * by the retention jobs (lib/evals/operations/lifecycle.ts). Requests,
 * completions, downloads and deletions are audited.
 */

export type WorkspaceExportLimits = ZipLimits & { maxDurationMs: number };
const MiB = 1024 * 1024;
/** Bounds for one export; the large-fixture test (tests/evals/data-controls-db.test.ts) stays well inside them. */
export const WORKSPACE_EXPORT_LIMITS: WorkspaceExportLimits = {
  maxUncompressedBytes: 256 * MiB,
  maxZipBytes: 64 * MiB,
  maxEntries: 50_000,
  maxDurationMs: 10 * 60_000,
};

export type WorkspaceExportStatus = "queued" | "running" | "completed" | "failed" | "deleted" | "expired";
export type WorkspaceExport = {
  id: string;
  status: WorkspaceExportStatus;
  locale: Locale;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  byteSize: number | null;
  fileName: string | null;
  reasonCode: string | null;
  counts: Record<string, number> | null;
  /** Owners download through the authenticated gateway while the file exists. */
  downloadPath: string | null;
};

type ExportRow = {
  id: string; status: WorkspaceExportStatus; locale: Locale; requested_at: Date | string; completed_at: Date | string | null;
  expires_at: Date | string | null; byte_size: string | number | null; file_name: string | null; reason_code: string | null;
  summary: { counts?: Record<string, number> } | null; object_key: string | null; object_deleted_at: Date | string | null; sha256: string | null;
};
const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

function view(orgId: string, row: ExportRow): WorkspaceExport {
  const live = row.status === "completed" && !row.object_deleted_at && !!row.expires_at && new Date(row.expires_at).getTime() > Date.now();
  return {
    id: row.id,
    status: row.status === "completed" && !live ? "expired" : row.status,
    locale: row.locale,
    requestedAt: iso(row.requested_at)!,
    completedAt: iso(row.completed_at),
    expiresAt: iso(row.expires_at),
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    fileName: row.file_name,
    reasonCode: row.reason_code,
    counts: row.summary?.counts ?? null,
    downloadPath: live ? `/api/evals/v1/exports/workspace/${row.id}/download?orgId=${orgId}` : null,
  };
}

const COLUMNS = "id,status,locale,requested_at,completed_at,expires_at,byte_size,file_name,reason_code,summary,object_key,object_deleted_at,sha256";

async function requireOwner(db: PoolClient, orgId: string, userId: string) {
  const { rows } = await db.query<{ role: string }>("SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2", [orgId, userId]);
  if (rows[0]?.role !== "owner") throw new EvalError("OWNER_REQUIRED", 403, "Only a workspace owner can export workspace data.");
}

async function audit(db: PoolClient, orgId: string, actorId: string, action: string, subject: string, details: Record<string, unknown>) {
  await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,$3,$4,$5)", [orgId, actorId, action, subject, details]);
}

/** Queues an export, or returns the one already waiting or being built. Owners only. */
export function requestWorkspaceExport(identity: EvalIdentity, orgId: string, locale: Locale): Promise<WorkspaceExport> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await requireOwner(db, orgId, identity.user.id);
    const deleting = (await db.query("SELECT 1 FROM evals.deletion_request WHERE org_id=$1 AND status IN ('requested','processing','completed') LIMIT 1", [orgId])).rowCount;
    if (deleting) throw new EvalError("VERSION_CONFLICT", 409, "This workspace is being deleted, so its data can no longer be exported.");
    const open = (await db.query<ExportRow>(`SELECT ${COLUMNS} FROM evals.workspace_export WHERE org_id=$1 AND status IN ('queued','running') LIMIT 1`, [orgId])).rows[0];
    if (open) return view(orgId, open);
    const name = identity.workspaces.find((workspace) => workspace.id === orgId)?.name
      ?? (await db.query<{ name: string }>("SELECT name FROM evals.workspace WHERE id=$1", [orgId])).rows[0]?.name ?? "Workspace";
    const row = (await db.query<ExportRow>(
      `INSERT INTO evals.workspace_export(org_id,locale,workspace_name,requested_by) VALUES($1,$2,$3,$4) RETURNING ${COLUMNS}`,
      [orgId, locale, name.slice(0, 160), identity.user.id],
    )).rows[0];
    await audit(db, orgId, identity.user.id, "workspace.export_requested", row.id, { locale });
    return view(orgId, row);
  });
}

/** The latest exports of the workspace, newest first. Owners only. */
export function listWorkspaceExports(identity: EvalIdentity, orgId: string): Promise<WorkspaceExport[]> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await requireOwner(db, orgId, identity.user.id);
    const { rows } = await db.query<ExportRow>(`SELECT ${COLUMNS} FROM evals.workspace_export WHERE org_id=$1 AND status<>'deleted' ORDER BY requested_at DESC, id DESC LIMIT 5`, [orgId]);
    return rows.map((row) => view(orgId, row));
  });
}

/** Deletes an export: it leaves the list now and its file is deleted by the next retention pass. Owners only. */
export function deleteWorkspaceExport(identity: EvalIdentity, orgId: string, id: string): Promise<{ id: string; status: "deleted" }> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await requireOwner(db, orgId, identity.user.id);
    const row = (await db.query<ExportRow>(`SELECT ${COLUMNS} FROM evals.workspace_export WHERE org_id=$1 AND id=$2 FOR UPDATE`, [orgId, id])).rows[0];
    if (!row || row.status === "deleted") throw new EvalError("SCOPE_DENIED", 404);
    if (row.status === "running") throw new EvalError("VERSION_CONFLICT", 409, "The export is being prepared. Delete it once it is ready.");
    await db.query("UPDATE evals.workspace_export SET status='deleted',deleted_at=now(),updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, id]);
    if (row.object_key && !row.object_deleted_at) {
      await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before) VALUES($1,'workspace_export',$2,'delete',now())
        ON CONFLICT(org_id,object_type,object_id,action) DO UPDATE SET not_before=LEAST(evals.retention_job.not_before,excluded.not_before)`, [orgId, id]);
    }
    await audit(db, orgId, identity.user.id, "workspace.export_deleted", id, { had_file: !!row.object_key && !row.object_deleted_at });
    return { id, status: "deleted" as const };
  });
}

/** Opens a finished export for download (owners only), audited once per download. */
export async function openWorkspaceExport(identity: EvalIdentity, orgId: string, id: string) {
  const row = await withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    await requireOwner(db, orgId, identity.user.id);
    const found = (await db.query<ExportRow>(`SELECT ${COLUMNS} FROM evals.workspace_export WHERE org_id=$1 AND id=$2`, [orgId, id])).rows[0];
    if (!found || found.status !== "completed" || found.object_deleted_at || !found.object_key || !found.expires_at || new Date(found.expires_at).getTime() <= Date.now()) {
      throw new EvalError("SCOPE_DENIED", 404, "This export is no longer available. Prepare a new one.");
    }
    await audit(db, orgId, identity.user.id, "workspace.export_downloaded", id, { byte_size: Number(found.byte_size) });
    return found;
  });
  const stream = await openVerifiedStream(row.object_key!, Number(row.byte_size), row.sha256!);
  return { stream, fileName: row.file_name!, byteSize: Number(row.byte_size) };
}

// ---------------------------------------------------------------------------
// Building the archive (scheduler).

type Claimed = { id: string; locale: Locale; workspace_name: string };

function slug(value: string, fallback: string) {
  const text = value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return text || fallback;
}

function jsonl(records: unknown[]) {
  return records.map((record) => canonicalJson(record)).join("\n") + "\n";
}

/** A CEF-style JSONL bundle: a manifest line, then one line per record with its content hash. */
function cefBundle(manifest: Record<string, unknown>, records: Array<{ record_type: string; content_hash: string; document: unknown }>) {
  return jsonl([
    { record_type: "manifest", schema_version: "1.0", cef_version: "1.0", ...manifest, record_count: records.length,
      records_sha256: sha256(canonicalJson(records.map((record) => ({ record_type: record.record_type, content_hash: record.content_hash })))) },
    ...records,
  ]);
}

class ExportTimeout extends Error {
  constructor() {
    super("export_timed_out");
  }
}

async function claim(orgId: string, actorId: string): Promise<Claimed | undefined> {
  return withTenant({ orgId, actorId }, async (db) => {
    // A build that stopped (worker restart) goes back to the queue, three attempts in all.
    await db.query(`UPDATE evals.workspace_export SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
      reason_code=CASE WHEN attempts>=3 THEN 'export_interrupted' ELSE reason_code END,updated_at=now()
      WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes'`, [orgId]);
    const job = (await db.query<Claimed>(`SELECT e.id,e.locale,e.workspace_name FROM evals.workspace_export e
      WHERE e.org_id=$1 AND e.status='queued'
        AND NOT EXISTS (SELECT 1 FROM evals.deletion_request d WHERE d.org_id=e.org_id AND d.status IN ('requested','processing','completed'))
      ORDER BY e.requested_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`, [orgId])).rows[0];
    if (!job) return undefined;
    await db.query("UPDATE evals.workspace_export SET status='running',started_at=now(),attempts=attempts+1,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, job.id]);
    return job;
  });
}

export type ExportSummary = {
  counts: Record<string, number>;
  entries: number;
  uncompressed_bytes: number;
  warnings: number;
  duration_ms: number;
};

/** Builds the ZIP for one claimed export. Exported for the large-fixture test. */
export async function buildWorkspaceArchive(orgId: string, actorId: string, job: Claimed, limits: WorkspaceExportLimits = WORKSPACE_EXPORT_LIMITS, now = new Date()) {
  const scope = { orgId, actorId };
  const started = Date.now();
  const tick = () => { if (Date.now() - started > limits.maxDurationMs) throw new ExportTimeout(); };
  const q = <T extends Record<string, unknown>>(sql: string, params: unknown[]) => withTenant(scope, async (db) => (await db.query<T>(sql, params)).rows);
  const locale: Locale = job.locale === "es" ? "es" : "en";
  const zip = new ZipWriter(limits, now);
  const warnings: Array<{ path: string; reason: string }> = [];
  const counts = { reports: 0, report_revisions: 0, test_sets: 0, test_set_versions: 0, runs: 0, observations: 0, observations_purged: 0, assessments: 0, systems: 0, sources: 0 };
  /** Optional renderings: a record that no longer renders is listed as a warning; limits always stop the build. */
  const attempt = async (path: string, render: () => string | Promise<string>) => {
    try {
      await zip.add(path, await render());
    } catch (error) {
      if (error instanceof ZipLimitError || error instanceof ExportTimeout) throw error;
      warnings.push({ path, reason: "render_failed" });
    }
  };

  await zip.add("README.txt", [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tv(`exportReadme${n}` as "exportReadme1", { workspace: job.workspace_name, date: now.toISOString().slice(0, 10), days: WORKSPACE_EXPORT_LINK_DAYS }, locale)).join("\n\n") + "\n");

  // Reports: every kept (not deleted) report and each of its revisions.
  const reports = await q<{ id: string; title: string; publication_status: string; current_revision_id: string | null; created_at: Date; updated_at: Date }>(
    "SELECT id,title,publication_status,current_revision_id,created_at,updated_at FROM evals.report WHERE org_id=$1 AND archived_at IS NULL ORDER BY created_at,id", [orgId]);
  const reportIndex: unknown[] = [];
  for (const [index, report] of reports.entries()) {
    tick();
    const folder = `reports/${String(index + 1).padStart(3, "0")}-${slug(report.title, "report")}`;
    const revisions = await q<{ id: string; run_id: string; content_hash: string; snapshot: { results?: Array<{ case_revision_id: string; observation_id: string; assessment_id: string }> }; review_status: string; created_at: Date; published_at: Date | null }>(
      "SELECT id,run_id,content_hash,snapshot,review_status,created_at,published_at FROM evals.report_revision WHERE org_id=$1 AND report_id=$2 ORDER BY created_at,id", [orgId, report.id]);
    for (const revision of revisions) {
      tick();
      const base = `${folder}/revisions/${revision.id}`;
      await zip.add(`${base}/snapshot.json`, JSON.stringify(revision.snapshot, null, 2) + "\n");
      await attempt(`${base}/evidence.cef.jsonl`, async () => {
        const records = await withTenant(scope, (db) => cefRecords(db, orgId, revision.snapshot.results ?? []));
        return renderCefJsonl({ report: revision.snapshot as never, ...records });
      });
      await attempt(`${base}/results.csv`, () => renderResultsCsv(revision.snapshot as never));
      counts.report_revisions++;
    }
    const current = revisions.find((revision) => revision.id === report.current_revision_id) ?? revisions.at(-1);
    if (current) await attempt(`${folder}/report.${locale}.html`, () => renderReportDocument(reportSnapshotSchema.parse(current.snapshot), locale));
    reportIndex.push({
      report_id: report.id, title: report.title, publication_status: report.publication_status, current_revision_id: report.current_revision_id,
      created_at: iso(report.created_at), updated_at: iso(report.updated_at), folder,
      revisions: revisions.map((revision) => ({ revision_id: revision.id, run_id: revision.run_id, content_hash: revision.content_hash, review_status: revision.review_status, created_at: iso(revision.created_at), published_at: iso(revision.published_at) })),
    });
    counts.reports++;
  }
  await zip.add("reports/index.json", JSON.stringify(reportIndex, null, 2) + "\n");

  // Test sets: each version's questions and rubrics.
  const suites = await q<{ id: string; title: string; created_at: Date }>("SELECT id,title,created_at FROM evals.suite WHERE org_id=$1 AND archived_at IS NULL ORDER BY created_at,id", [orgId]);
  const suiteIndex: unknown[] = [];
  for (const [index, suite] of suites.entries()) {
    tick();
    const folder = `test-sets/${String(index + 1).padStart(3, "0")}-${slug(suite.title, "test-set")}`;
    const versions = await q<{ id: string; content_hash: string; created_at: Date }>("SELECT id,content_hash,created_at FROM evals.suite_version WHERE org_id=$1 AND suite_id=$2 ORDER BY created_at,id", [orgId, suite.id]);
    const versionIndex: unknown[] = [];
    for (const version of versions) {
      tick();
      const rows = await q<{ case_hash: string; case_document: unknown; rubric_id: string; rubric_hash: string; rubric_document: unknown }>(
        `SELECT cr.content_hash AS case_hash,cr.document AS case_document,rr.id AS rubric_id,rr.content_hash AS rubric_hash,rr.document AS rubric_document
         FROM evals.suite_case sc JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
         JOIN evals.rubric_revision rr ON (rr.org_id,rr.id)=(cr.org_id,cr.rubric_revision_id)
         WHERE sc.org_id=$1 AND sc.suite_version_id=$2 ORDER BY sc.ordinal`, [orgId, version.id]);
      const rubrics = new Map(rows.map((row) => [row.rubric_id, row]));
      const records = [
        ...rows.map((row) => ({ record_type: "case", content_hash: row.case_hash, document: row.case_document })),
        ...[...rubrics.values()].map((row) => ({ record_type: "rubric", content_hash: row.rubric_hash, document: row.rubric_document })),
      ];
      const path = `${folder}/${version.id}.cef.jsonl`;
      await zip.add(path, cefBundle({ kind: "test_set", suite_id: suite.id, suite_version_id: version.id, title: suite.title, suite_version_content_hash: version.content_hash }, records));
      versionIndex.push({ suite_version_id: version.id, content_hash: version.content_hash, created_at: iso(version.created_at), questions: rows.length, file: path });
      counts.test_set_versions++;
    }
    suiteIndex.push({ suite_id: suite.id, title: suite.title, created_at: iso(suite.created_at), versions: versionIndex });
    counts.test_sets++;
  }
  await zip.add("test-sets/index.json", JSON.stringify(suiteIndex, null, 2) + "\n");

  // Runs: the questions asked, every answer (purged ones without their content) and every grade.
  const runs = await q<{ id: string; evaluation_id: string; evaluation_title: string; status: string; execution_mode: string; suite_version_id: string; target_revision_id: string; created_at: Date; updated_at: Date }>(
    `SELECT r.id,r.evaluation_id,e.title AS evaluation_title,r.status,r.execution_mode,r.suite_version_id,r.target_revision_id,r.created_at,r.updated_at
     FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
     WHERE r.org_id=$1 AND e.archived_at IS NULL ORDER BY r.created_at,r.id`, [orgId]);
  const runIndex: unknown[] = [];
  for (const run of runs) {
    tick();
    const cases = await q<{ content_hash: string; document: unknown }>(
      `SELECT DISTINCT ON (cr.id) cr.content_hash,cr.document FROM evals.case_unit cu JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
       WHERE cu.org_id=$1 AND cu.run_id=$2 ORDER BY cr.id`, [orgId, run.id]);
    const observations = await q<{ content_hash: string; document: unknown; purged: boolean }>(
      "SELECT content_hash,document,purged_at IS NOT NULL AS purged FROM evals.observation WHERE org_id=$1 AND run_id=$2 ORDER BY created_at,id", [orgId, run.id]);
    const assessments = await q<{ content_hash: string; document: unknown }>(
      `SELECT a.content_hash,a.document FROM evals.assessment a JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id)
       WHERE o.org_id=$1 AND o.run_id=$2 ORDER BY a.created_at,a.id`, [orgId, run.id]);
    const purged = observations.filter((row) => row.purged).length;
    const path = `runs/${run.id}.cef.jsonl`;
    await zip.add(path, cefBundle(
      { kind: "run", run_id: run.id, evaluation_id: run.evaluation_id, suite_version_id: run.suite_version_id, target_revision_id: run.target_revision_id, status: run.status, observations_purged: purged },
      [
        ...cases.map((row) => ({ record_type: "case", content_hash: row.content_hash, document: row.document })),
        ...observations.map((row) => ({ record_type: "observation", content_hash: row.content_hash, document: row.document })),
        ...assessments.map((row) => ({ record_type: "assessment", content_hash: row.content_hash, document: row.document })),
      ],
    ));
    runIndex.push({ run_id: run.id, evaluation_id: run.evaluation_id, evaluation_title: run.evaluation_title, status: run.status, execution_mode: run.execution_mode,
      created_at: iso(run.created_at), updated_at: iso(run.updated_at), questions: cases.length, observations: observations.length, observations_purged: purged, assessments: assessments.length, file: path });
    counts.runs++;
    counts.observations += observations.length;
    counts.observations_purged += purged;
    counts.assessments += assessments.length;
  }
  await zip.add("runs/index.json", JSON.stringify(runIndex, null, 2) + "\n");

  // Systems and sources: what they are, never credentials or document contents.
  const systems = await q<{ id: string; title: string; created_at: Date }>("SELECT id,title,created_at FROM evals.target WHERE org_id=$1 AND archived_at IS NULL ORDER BY created_at,id", [orgId]);
  await zip.add("systems/index.json", JSON.stringify(systems.map((row) => ({ system_id: row.id, title: row.title, created_at: iso(row.created_at) })), null, 2) + "\n");
  const sources = await q<{ id: string; title: string; rights: string; created_at: Date; revisions: string }>(
    `SELECT s.id,s.title,s.rights,s.created_at,(SELECT count(*) FROM evals.source_revision r WHERE r.org_id=s.org_id AND r.source_id=s.id)::text AS revisions
     FROM evals.source s WHERE s.org_id=$1 AND s.archived_at IS NULL ORDER BY s.created_at,s.id`, [orgId]);
  await zip.add("sources/index.json", JSON.stringify(sources.map((row) => ({ source_id: row.id, title: row.title, rights: row.rights, created_at: iso(row.created_at), revisions: Number(row.revisions) })), null, 2) + "\n");
  counts.systems = systems.length;
  counts.sources = sources.length;
  tick();

  const retention = await q<{ observation_days: number | null }>("SELECT observation_days FROM evals.workspace_retention WHERE org_id=$1", [orgId]);
  await zip.add("manifest.json", JSON.stringify({
    format: "caudals.workspace-export", format_version: "1.0", cef_version: "1.0",
    workspace: { id: orgId, name: job.workspace_name }, export_id: job.id, exported_at: now.toISOString(), locale,
    retention: { observation_days: retention[0]?.observation_days ?? null },
    counts,
    excluded: ["deleted_items", "source_document_contents", "credentials_and_keys", "audit_log"],
    warnings,
    files: zip.files,
  }, null, 2) + "\n");
  const archive = zip.finish();
  const fileName = `Caudals-workspace-export-${slug(job.workspace_name, "workspace")}-${now.toISOString().slice(0, 10)}.zip`;
  const summary: ExportSummary = { counts, entries: zip.files.length, uncompressed_bytes: zip.uncompressedBytes, warnings: warnings.length, duration_ms: Date.now() - started };
  return { archive, fileName, summary };
}

/** Builds and seals the next queued export of one workspace; false when there was none. */
export async function processWorkspaceExport(orgId: string, actorId: string, limits: WorkspaceExportLimits = WORKSPACE_EXPORT_LIMITS): Promise<boolean> {
  const job = await claim(orgId, actorId);
  if (!job) return false;
  const scope = { orgId, actorId };
  try {
    const { archive, fileName, summary } = await buildWorkspaceArchive(orgId, actorId, job, limits);
    const key = objectKey(orgId, job.id, true);
    const hash = sha256(archive);
    await sealObject(key, archive, "application/zip");
    const done = await withTenant(scope, async (db) => {
      const updated = (await db.query(`UPDATE evals.workspace_export SET status='completed',completed_at=now(),object_key=$3,sha256=$4,byte_size=$5,file_name=$6,summary=$7,
        expires_at=now()+make_interval(days=>$8),updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'`,
        [orgId, job.id, key, hash, archive.length, fileName, summary, WORKSPACE_EXPORT_LINK_DAYS])).rowCount;
      if (updated) await audit(db, orgId, actorId, "workspace.export_completed", job.id, { byte_size: archive.length, ...summary });
      return !!updated;
    });
    // Cancelled while building (the workspace is being deleted): the file must not stay.
    if (!done) await deletePrivateObject(key);
  } catch (error) {
    const reason = error instanceof ZipLimitError ? "export_too_large" : error instanceof ExportTimeout ? "export_timed_out" : "export_failed";
    if (reason === "export_failed") captureServerError(error, { service: "evals-scheduler", event: "workspace_export_failed", workspace: orgId });
    await withTenant(scope, async (db) => {
      const updated = (await db.query("UPDATE evals.workspace_export SET status='failed',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'", [orgId, job.id, reason])).rowCount;
      if (updated) await audit(db, orgId, actorId, "workspace.export_failed", job.id, { reason });
    });
  }
  return true;
}

/** One pass over the workspaces with a queued export; at most one export each. */
export async function tickWorkspaceExports(actorId: string, limits: WorkspaceExportLimits = WORKSPACE_EXPORT_LIMITS) {
  const orgs = await withTenant({ orgId: "", actorId }, async (db) => (await db.query("SELECT evals.workspace_export_due_workspaces() AS id")).rows.map((row) => row.id as string));
  let processed = 0;
  for (const orgId of orgs) if (await processWorkspaceExport(orgId, actorId, limits)) processed++;
  return { workspaces: orgs.length, processed };
}
