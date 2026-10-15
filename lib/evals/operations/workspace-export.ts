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
import { aiDisclosureCheckEnabled, withoutDisclosure } from "../scoring/disclosure";
import { withTenant } from "../repositories/db";
import { cefRecords } from "../repositories/managed";
import { deletePrivateObject, objectKey, openVerifiedStream, readVerified, sealObject } from "../storage/private";
import { captureServerError } from "../../observability/capture";

/**
 * "Export all workspace data" (launch L-32, spec P-44). An owner asks; the
 * scheduler builds one ZIP in the background (tickWorkspaceExports) with every
 * kept report (readable HTML in the requester's language, the snapshot JSON,
 * the results CSV and the CEF evidence bundle of each revision), every test
 * set version and every run as CEF JSONL (questions, answers and grades), the
 * questions asked about each report (L-36), every source with its CEF record
 * and, within the size limits, its original file (else a reference), the
 * publication consents (L-31), the DPA acceptances and countersigned-copy
 * references (L-30, L-32), the workspace's audit log and an index of systems
 * (gap G3). Records only owners can read (consents, the countersigned copies,
 * the audit log) are read as the owner who asked, through row-level security,
 * and the build stops if that person is no longer an owner. The file is sealed in private storage, can
 * be downloaded by owners for WORKSPACE_EXPORT_LINK_DAYS and is then deleted
 * by the retention jobs (lib/evals/operations/lifecycle.ts). Requests,
 * completions, downloads and deletions are audited.
 */

/**
 * `maxSourceBytes` bounds the original source files copied into one export;
 * past it (or past the room the archive limits leave) a source revision is
 * listed by reference: its checksum, size and type, as in its CEF record.
 * `auditEntriesPerFile` splits the audit log into numbered files, so a long
 * log is never held in memory as one string.
 */
export type WorkspaceExportLimits = ZipLimits & { maxDurationMs: number; maxSourceBytes: number; auditEntriesPerFile: number };
const MiB = 1024 * 1024;
/** Bounds for one export; the large-fixture test (tests/evals/data-controls-db.test.ts) stays well inside them. */
export const WORKSPACE_EXPORT_LIMITS: WorkspaceExportLimits = {
  maxUncompressedBytes: 256 * MiB,
  maxZipBytes: 64 * MiB,
  maxEntries: 50_000,
  maxDurationMs: 10 * 60_000,
  maxSourceBytes: 32 * MiB,
  auditEntriesPerFile: 20_000,
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

type Claimed = { id: string; locale: Locale; workspace_name: string; requested_by: string };

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

/** The person who asked is no longer an owner: owner-only records must not be read for them. */
class ExportOwnerRequired extends Error {
  constructor() {
    super("export_owner_required");
  }
}

/** File extensions for the original source files (evals.artifact media types). */
const SOURCE_EXTENSION: Record<string, string> = {
  "text/plain": "txt", "text/markdown": "md", "application/pdf": "pdf", "text/csv": "csv", "application/json": "json",
  "application/x-ndjson": "jsonl", "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
/** Rights under which the original file and its text belong to the customer; other sources (licensed, Caudals' own) are listed by reference. */
const CUSTOMER_RIGHTS = new Set(["customer_owned", "public_domain"]);
const AUDIT_PAGE = 5_000;
type AuditRow = { id: string; created_at: Date; cursor: string; actor_id: string; action: string; subject_id: string; details: unknown };

async function claim(orgId: string, actorId: string): Promise<Claimed | undefined> {
  return withTenant({ orgId, actorId }, async (db) => {
    // A build that stopped (worker restart) goes back to the queue, three attempts in all.
    await db.query(`UPDATE evals.workspace_export SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
      reason_code=CASE WHEN attempts>=3 THEN 'export_interrupted' ELSE reason_code END,updated_at=now()
      WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes'`, [orgId]);
    const job = (await db.query<Claimed>(`SELECT e.id,e.locale,e.workspace_name,e.requested_by FROM evals.workspace_export e
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
  const disclosure = aiDisclosureCheckEnabled();
  const warnings: Array<{ path: string; reason: string }> = [];
  const counts = {
    reports: 0, report_revisions: 0, report_questions: 0, test_sets: 0, test_set_versions: 0, runs: 0, observations: 0, observations_purged: 0, assessments: 0,
    systems: 0, sources: 0, source_revisions: 0, source_files: 0, source_files_referenced: 0,
    publication_consents: 0, dpa_acceptances: 0, dpa_countersigned: 0, audit_events: 0,
  };
  // Owner-only records are read as the owner who asked (row-level security), never as the service.
  const asRequester = <T extends Record<string, unknown>>(sql: string, params: unknown[]) => withTenant({ orgId, actorId: job.requested_by }, async (db) => (await db.query<T>(sql, params)).rows);
  const role = await asRequester<{ role: string }>("SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2", [orgId, job.requested_by]);
  if (role[0]?.role !== "owner") throw new ExportOwnerRequired();
  /** Optional renderings: a record that no longer renders is listed as a warning; limits always stop the build. */
  const attempt = async (path: string, render: () => string | Promise<string>) => {
    try {
      await zip.add(path, await render());
    } catch (error) {
      if (error instanceof ZipLimitError || error instanceof ExportTimeout) throw error;
      warnings.push({ path, reason: "render_failed" });
    }
  };

  await zip.add("README.txt", [1, 2, 3, 4, 5, 9, 6, 7, 8].map((n) => tv(`exportReadme${n}` as "exportReadme1", { workspace: job.workspace_name, date: now.toISOString().slice(0, 10), days: WORKSPACE_EXPORT_LINK_DAYS }, locale)).join("\n\n") + "\n");

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
    // Questions asked about this report (launch L-36), with their cited answers; an erased question keeps only its record.
    const questions = await asRequester<{ id: string; report_revision_id: string; run_id: string; asked_by: string; question: string | null; language: string; status: string; reason_code: string | null;
      answer: unknown; cited_result_ids: string[]; cited_finding_ids: string[]; model_id: string | null; model_source: string | null; data_routing: string | null; ledger_mode: string | null;
      charged_ucr: string | number; created_at: Date; finished_at: Date | null; deleted_at: Date | null }>(
      `SELECT id,report_revision_id,run_id,asked_by,question,language,status,reason_code,answer,cited_result_ids,cited_finding_ids,model_id,model_source,data_routing,ledger_mode,charged_ucr,created_at,finished_at,deleted_at
       FROM evals.report_question WHERE org_id=$1 AND report_id=$2 ORDER BY created_at,id`, [orgId, report.id]);
    if (questions.length) {
      await zip.add(`${folder}/questions.json`, JSON.stringify(questions.map((row) => ({
        question_id: row.id, report_revision_id: row.report_revision_id, run_id: row.run_id, asked_by: row.asked_by, language: row.language, status: row.status, reason_code: row.reason_code,
        question: row.question, answer: row.answer, cited_result_ids: row.cited_result_ids, cited_finding_ids: row.cited_finding_ids,
        model: row.model_id, model_source: row.model_source, data_routing: row.data_routing, ledger_mode: row.ledger_mode, charged_ucr: Number(row.charged_ucr),
        asked_at: iso(row.created_at), finished_at: iso(row.finished_at), erased_at: iso(row.deleted_at),
      })), null, 2) + "\n");
      counts.report_questions += questions.length;
    }
    const current = revisions.find((revision) => revision.id === report.current_revision_id) ?? revisions.at(-1);
    // The readable report says what the web report says: the AI-disclosure check only while AI_DISCLOSURE_CHECK is on (snapshot.json keeps the record as stored).
    if (current) await attempt(`${folder}/report.${locale}.html`, () => renderReportDocument(reportSnapshotSchema.parse(disclosure ? current.snapshot : withoutDisclosure(current.snapshot)), locale));
    reportIndex.push({
      report_id: report.id, title: report.title, publication_status: report.publication_status, current_revision_id: report.current_revision_id,
      created_at: iso(report.created_at), updated_at: iso(report.updated_at), folder, questions: questions.length,
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

  // Systems: what they are, never credentials or keys.
  const systems = await q<{ id: string; title: string; created_at: Date }>("SELECT id,title,created_at FROM evals.target WHERE org_id=$1 AND archived_at IS NULL ORDER BY created_at,id", [orgId]);
  await zip.add("systems/index.json", JSON.stringify(systems.map((row) => ({ system_id: row.id, title: row.title, created_at: iso(row.created_at) })), null, 2) + "\n");
  counts.systems = systems.length;
  tick();

  // Legal records (owners only): publication consents and their public pages (L-31),
  // DPA acceptances (L-30) and the countersigned copies attached to them (L-32), by reference.
  const consents = await asRequester<{ id: string; report_id: string; report_revision_id: string; results_page: boolean; sector_index: boolean; public_name: string | null; scope_summary: string | null;
    index_sector: string | null; consent_version: string; locale: string; method: string; signer_user_id: string | null; signer_name: string; signer_role: string; document_ref: string | null;
    signed_at: Date; recorded_at: Date; revoked_at: Date | null; revoked_by: string | null; revocation_reason: string | null; slug: string | null; published_at: Date | null; unpublished_at: Date | null; unpublish_reason: string | null }>(
    `SELECT c.id,c.report_id,c.report_revision_id,c.results_page,c.sector_index,c.public_name,c.scope_summary,c.index_sector,c.consent_version,c.locale,c.method,c.signer_user_id,c.signer_name,c.signer_role,
            c.document_ref,c.signed_at,c.recorded_at,c.revoked_at,c.revoked_by,c.revocation_reason,p.slug,p.published_at,p.unpublished_at,p.unpublish_reason
       FROM evals.publication_consent c LEFT JOIN evals.public_result_page p ON (p.org_id,p.consent_id)=(c.org_id,c.id)
      WHERE c.org_id=$1 ORDER BY c.recorded_at,c.id`, [orgId]);
  await zip.add("legal/publication-consents.json", JSON.stringify(consents.map((row) => ({
    consent_id: row.id, report_id: row.report_id, report_revision_id: row.report_revision_id, results_page: row.results_page, sector_index: row.sector_index,
    public_name: row.public_name, scope_summary: row.scope_summary, index_sector: row.index_sector, consent_version: row.consent_version, locale: row.locale, method: row.method,
    signer: { user_id: row.signer_user_id, name: row.signer_name, role: row.signer_role }, document_ref: row.document_ref, signed_at: iso(row.signed_at), recorded_at: iso(row.recorded_at),
    revoked_at: iso(row.revoked_at), revoked_by: row.revoked_by, revocation_reason: row.revocation_reason,
    public_page: row.slug ? { slug: row.slug, published_at: iso(row.published_at), unpublished_at: iso(row.unpublished_at), unpublish_reason: row.unpublish_reason } : null,
  })), null, 2) + "\n");
  counts.publication_consents = consents.length;
  const acceptances = await asRequester<{ id: string; user_id: string; version: string; context: string; locale: string | null; request_id: string | null; accepted_at: Date; signer: { name?: unknown; email?: unknown } | null }>(
    `SELECT t.id,t.user_id,t.version,t.context,t.locale,t.request_id,t.accepted_at,
            (SELECT a.details->'signer' FROM evals.audit_event a WHERE a.org_id=t.org_id AND a.action='legal.dpa_accepted' AND a.subject_id=t.id::text ORDER BY a.created_at LIMIT 1) AS signer
       FROM evals.terms_acceptance t WHERE t.org_id=$1 AND t.document='dpa' ORDER BY t.accepted_at,t.id`, [orgId]);
  const countersigned = await asRequester<{ id: string; acceptance_id: string; version: string; sha256: string; byte_size: number; file_name: string; uploaded_at: Date; removed_at: Date | null; removal_reason: string | null }>(
    "SELECT id,acceptance_id,version,sha256,byte_size,file_name,uploaded_at,removed_at,removal_reason FROM evals.dpa_countersigned WHERE org_id=$1 ORDER BY uploaded_at,id", [orgId]);
  await zip.add("legal/dpa.json", JSON.stringify({
    acceptances: acceptances.map((row) => ({
      acceptance_id: row.id, version: row.version, context: row.context, locale: row.locale, request_id: row.request_id, accepted_at: iso(row.accepted_at),
      signer: { user_id: row.user_id, name: typeof row.signer?.name === "string" ? row.signer.name : null, email: typeof row.signer?.email === "string" ? row.signer.email : null },
    })),
    // The signed PDFs stay in private storage; owners download the live copy from Settings → General.
    countersigned_copies: countersigned.map((row) => ({
      countersigned_id: row.id, acceptance_id: row.acceptance_id, version: row.version, file_name: row.file_name, bytes: row.byte_size, sha256: row.sha256,
      uploaded_at: iso(row.uploaded_at), removed_at: iso(row.removed_at), removal_reason: row.removal_reason,
    })),
  }, null, 2) + "\n");
  counts.dpa_acceptances = acceptances.length;
  counts.dpa_countersigned = countersigned.length;
  tick();

  // The workspace's audit log (owners and operators read it), oldest first, one
  // JSON line per entry, in numbered files of `auditEntriesPerFile` entries.
  let auditLines: string[] = [], auditFiles = 0;
  const flushAudit = async () => {
    await zip.add(`audit/audit-log-${String(++auditFiles).padStart(3, "0")}.jsonl`, auditLines.length ? auditLines.join("\n") + "\n" : "");
    auditLines = [];
  };
  for (let after: { at: string; id: string } | null = null; ;) {
    tick();
    // The cursor keeps the timestamp's microseconds (text), so no entry is repeated or skipped.
    const page: AuditRow[] = await asRequester<AuditRow>(
      `SELECT id,created_at,created_at::text AS cursor,actor_id,action,subject_id,details FROM evals.audit_event
        WHERE org_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT ${AUDIT_PAGE}`,
      [orgId, after?.at ?? null, after?.id ?? null]);
    for (const row of page) {
      auditLines.push(JSON.stringify({ id: row.id, at: iso(row.created_at), actor_id: row.actor_id, action: row.action, subject_id: row.subject_id, details: row.details ?? null }));
      counts.audit_events++;
      if (auditLines.length >= limits.auditEntriesPerFile) await flushAudit();
    }
    if (page.length < AUDIT_PAGE) break;
    after = { at: page[page.length - 1].cursor, id: page[page.length - 1].id };
  }
  if (auditLines.length || !auditFiles) await flushAudit();

  // Sources, last: each revision's CEF record (title, anchors and excerpts, the
  // original's checksum) and, while the limits leave room, the original file;
  // otherwise the record names it by reference. Licensed and Caudals-owned
  // sources are listed by reference only.
  const sources = await q<{ id: string; title: string; rights: string; created_at: Date }>(
    "SELECT s.id,s.title,s.rights,s.created_at FROM evals.source s WHERE s.org_id=$1 AND s.archived_at IS NULL ORDER BY s.created_at,s.id", [orgId]);
  const sourceIndex: unknown[] = [];
  let sourceBytes = 0;
  for (const [index, source] of sources.entries()) {
    tick();
    const folder = `sources/${String(index + 1).padStart(3, "0")}-${slug(source.title, "source")}`;
    const owned = CUSTOMER_RIGHTS.has(source.rights);
    const revisions = await q<{ id: string; content_hash: string; document: unknown; extraction_version: string; created_at: Date; object_key: string; sha256: string; byte_size: number; media_type: string; state: string }>(
      `SELECT r.id,r.content_hash,r.document,r.extraction_version,r.created_at,a.object_key,a.sha256,a.byte_size,a.media_type,a.state
         FROM evals.source_revision r JOIN evals.artifact a ON (a.org_id,a.id)=(r.org_id,r.artifact_id)
        WHERE r.org_id=$1 AND r.source_id=$2 ORDER BY r.created_at,r.id`, [orgId, source.id]);
    const revisionIndex: unknown[] = [];
    for (const revision of revisions) {
      tick();
      const artifact = { sha256: revision.sha256, bytes: revision.byte_size, media_type: revision.media_type };
      let record: string | null = null, original: string | null = null, omitted: "not_customer_owned" | "size_limit" | "unavailable" | null = null;
      if (!owned) omitted = "not_customer_owned";
      else {
        record = `${folder}/${revision.id}.cef.jsonl`;
        await zip.add(record, cefBundle({ kind: "source", source_id: source.id, source_revision_id: revision.id, title: source.title, rights: source.rights },
          [{ record_type: "source", content_hash: revision.content_hash, document: revision.document }]));
        const reserve = MiB + (zip.files.length + 64) * 512;
        const fits = sourceBytes + revision.byte_size <= limits.maxSourceBytes
          && zip.uncompressedBytes + revision.byte_size + reserve <= limits.maxUncompressedBytes
          && zip.size + revision.byte_size + reserve <= limits.maxZipBytes;
        if (!fits) omitted = "size_limit";
        else if (revision.state !== "ready") omitted = "unavailable";
        else {
          const bytes = await readVerified(revision.object_key, revision.byte_size, revision.sha256).catch(() => null);
          if (!bytes) omitted = "unavailable";
          else {
            original = `${folder}/${revision.id}/original.${SOURCE_EXTENSION[revision.media_type] ?? "bin"}`;
            await zip.add(original, bytes);
            sourceBytes += bytes.length;
          }
        }
      }
      if (original) counts.source_files++;
      else counts.source_files_referenced++;
      revisionIndex.push({ revision_id: revision.id, content_hash: revision.content_hash, extraction_version: revision.extraction_version, created_at: iso(revision.created_at), artifact, record, original, original_omitted: omitted });
      counts.source_revisions++;
    }
    sourceIndex.push({ source_id: source.id, title: source.title, rights: source.rights, created_at: iso(source.created_at), folder, revisions: revisionIndex });
  }
  await zip.add("sources/index.json", JSON.stringify(sourceIndex, null, 2) + "\n");
  counts.sources = sources.length;
  tick();

  const retention = await q<{ observation_days: number | null }>("SELECT observation_days FROM evals.workspace_retention WHERE org_id=$1", [orgId]);
  await zip.add("manifest.json", JSON.stringify({
    format: "caudals.workspace-export", format_version: "1.1", cef_version: "1.0",
    workspace: { id: orgId, name: job.workspace_name }, export_id: job.id, exported_at: now.toISOString(), locale,
    retention: { observation_days: retention[0]?.observation_days ?? null },
    counts,
    excluded: ["deleted_items", "credentials_and_keys", "countersigned_dpa_files", "staff_only_records"],
    source_limits: { max_source_bytes: limits.maxSourceBytes, included_bytes: sourceBytes },
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
    const reason = error instanceof ZipLimitError ? "export_too_large" : error instanceof ExportTimeout ? "export_timed_out" : error instanceof ExportOwnerRequired ? "export_owner_required" : "export_failed";
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
