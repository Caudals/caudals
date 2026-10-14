/**
 * Data controls (launch L-32, spec P-44) on the real schema and object storage:
 * the answer-retention setting applied through the retention jobs (pins kept,
 * only answers older than the setting purged, audited, replayable) and
 * "Export all workspace data" (owner-only, contents, audited, expiry, a large
 * fixture within limits). The suite runs on its own database copy
 * (decision I-12): the lifecycle pass is database-wide.
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import JSZip from "jszip";
import { CreateBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";
import { testDatabaseUrls } from "../helpers/test-database";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const urls = testDatabaseUrls("data_controls");
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;
const BUCKET = "evals-data-controls-test";

describe.skipIf(!urls.ownerUrl || !urls.runtimeUrl || !endpoint)("data controls (launch L-32)", () => {
  const owner = new Pool({ connectionString: urls.ownerUrl, max: 2 });
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
  const exists = (key: string) => s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(() => true, () => false);
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", urls.runtimeUrl!);
    vi.stubEnv("DATA_CONTROLS_ENABLED", "true");
    for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint!, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: BUCKET, DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    try { await s3.send(new CreateBucketCommand({ Bucket: BUCKET })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
  });
  afterAll(async () => {
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await owner.end();
    await getEvalsPool().end();
    s3.destroy();
    vi.unstubAllEnvs();
  });

  async function asOwner<T>(work: (db: PoolClient) => Promise<T>, actorId = "test:fixture", orgId = "") {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  /** A person with a membership (and optionally a platform role). */
  async function person(orgId: string | null, role: "owner" | "editor" | "viewer" | "operator" | null, platformRole?: "operator" | "platform_admin"): Promise<EvalIdentity> {
    const id = createPrefixedId("au");
    const email = `${randomUUID()}@example.test`;
    await asOwner(async (db) => {
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, `Fixture ${role ?? platformRole}`, email]);
      if (orgId && role) await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, id, role]);
      if (platformRole) await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, platformRole]);
    }, id, orgId ?? "");
    return { user: { id, email, name: `Fixture ${role ?? platformRole}` }, platformRole: platformRole ?? null, workspaces: orgId && role ? [{ id: orgId, name: "Judge fixture", role }] : [] };
  }
  /** Moves observations back in time (bypassing the immutability trigger, as only a fixture may). */
  async function age(ids: string[], days: number) {
    await asOwner(async (db) => {
      await db.query("SET LOCAL session_replication_role = replica");
      await db.query("UPDATE evals.observation SET created_at=now()-make_interval(days=>$2) WHERE id=ANY($1::uuid[])", [ids, days]);
    });
  }
  async function auditActions(orgId: string, prefix: string) {
    return (await owner.query("SELECT action,actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action LIKE $2 ORDER BY created_at,id", [orgId, `${prefix}%`])).rows;
  }

  it("purges only unpinned answers older than the setting, through the retention jobs, audited and replayable", async () => {
    const { scoreRun, createReportForRun, publishReport } = await import("@/lib/evals/repositories/managed");
    const { getRetention, setRetention } = await import("@/lib/evals/data-controls/retention");
    const { processRetention, replayRecoveryControls, tickLifecycle, tickObservationRetention } = await import("@/lib/evals/operations/lifecycle");
    const { scope, orgId, run } = await importedJudgeRunFixture(owner, urls.runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Retention", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(scope, report.reportId, report.revisionId);
    const ownerIdentity = await person(orgId, "owner");
    const editor = await person(orgId, "editor");
    const observations = (await owner.query("SELECT id,content_hash,document FROM evals.observation WHERE run_id=$1 ORDER BY created_at,id", [run.id])).rows;
    expect(observations).toHaveLength(2);
    const [old, recent] = observations;
    await age([old.id], 40);
    await age([recent.id], 10);
    const service = "service:data-controls-test";
    const state = async () => (await owner.query("SELECT id,purged_at,document,content_hash FROM evals.observation WHERE run_id=$1 ORDER BY created_at,id", [run.id])).rows;

    // Unset (the default): nothing is purged, whatever the age.
    expect(await getRetention(ownerIdentity, orgId, 30)).toMatchObject({ observationDays: null, canChange: true, preview: { days: 30, due: 0, pinned: 1, purged: 0 } });
    await expect(setRetention(editor, orgId, 30)).rejects.toMatchObject({ code: "OWNER_REQUIRED", status: 403 });
    // The database refuses a non-owner too, even through the runtime role directly.
    const { withTenant } = await import("@/lib/evals/repositories/db");
    await expect(withTenant({ orgId, actorId: editor.user.id }, (db) => db.query("SELECT * FROM evals.set_observation_retention($1,30)", [orgId]))).rejects.toThrow("OWNER_REQUIRED");
    await expect(withTenant({ orgId, actorId: ownerIdentity.user.id }, (db) => db.query("SELECT * FROM evals.set_observation_retention($1,45)", [orgId]))).rejects.toThrow("RETENTION_INVALID");

    // 30 days: the published report pins its run, so nothing is due.
    expect(await setRetention(ownerIdentity, orgId, 30)).toMatchObject({ observationDays: 30, version: 1, preview: { due: 0, pinned: 1 } });
    expect(await tickObservationRetention(service)).toMatchObject({ scheduled: 0 });
    expect(await withTenant({ orgId, actorId: service }, async (db) => Number((await db.query("SELECT evals.purge_retained_observations($1,NULL,100) AS n", [orgId])).rows[0].n))).toBe(0);

    // Withdrawn, but the run is paused (active work): still pinned.
    await owner.query("UPDATE evals.report SET publication_status='withdrawn' WHERE id=$1", [report.reportId]);
    await owner.query("UPDATE evals.run SET status='paused' WHERE id=$1", [run.id]);
    expect((await getRetention(ownerIdentity, orgId, 30)).preview).toMatchObject({ due: 0, pinned: 1 });
    await owner.query("UPDATE evals.run SET status='completed' WHERE id=$1", [run.id]);
    // Judge calls still queued for the run (no judge model in the fixture) keep it pinned too.
    expect(Number((await owner.query("SELECT count(*) FROM evals.judge_job WHERE run_id=$1 AND status='queued'", [run.id])).rows[0].count)).toBeGreaterThan(0);
    expect((await getRetention(ownerIdentity, orgId, 30)).preview).toMatchObject({ due: 0, pinned: 1 });
    await owner.query("UPDATE evals.judge_job SET status='skipped',updated_at=now() WHERE run_id=$1 AND status='queued'", [run.id]);
    expect((await getRetention(ownerIdentity, orgId, 30)).preview).toMatchObject({ due: 1, pinned: 0, purged: 0 });

    // The feature switched off: a queued purge waits and nothing changes.
    expect(await tickObservationRetention(service)).toMatchObject({ workspaces: expect.any(Number), scheduled: 1 });
    vi.stubEnv("DATA_CONTROLS_ENABLED", "false");
    await tickLifecycle(service);
    vi.stubEnv("DATA_CONTROLS_ENABLED", "true");
    const job = (await owner.query("SELECT id,status,reason_code FROM evals.retention_job WHERE org_id=$1 AND object_type='observation_run'", [orgId])).rows;
    expect(job).toEqual([{ id: expect.any(String), status: "failed", reason_code: "data_controls_off" }]);
    expect((await state()).every((row) => row.purged_at === null)).toBe(true);
    // An hour later the hourly pass re-arms it and the lifecycle pass purges the old answer only.
    await owner.query("UPDATE evals.retention_job SET completed_at=now()-interval '2 hours' WHERE id=$1", [job[0].id]);
    expect(await tickObservationRetention(service)).toMatchObject({ scheduled: 1 });
    await tickLifecycle(service);
    const [purged, kept] = await state();
    expect(purged.purged_at).not.toBeNull();
    expect(purged.content_hash).toBe(old.content_hash);
    expect(purged.document).toMatchObject({ observation_id: old.document.observation_id, status: old.document.status, messages: [], tool_events: [], artifacts: [] });
    expect(purged.document.extensions["caudals.evals/retention"]).toMatchObject({ reason: "workspace_retention", content_hash: "original" });
    expect(JSON.stringify(purged.document)).not.toContain("10% service fee");
    expect(kept.purged_at).toBeNull();
    expect(kept.document).toEqual(recent.document);
    expect((await owner.query("SELECT status FROM evals.retention_job WHERE id=$1", [job[0].id])).rows[0].status).toBe("completed");
    // Grades and their provenance stay; the purged run cannot be graded or reported again.
    expect(Number((await owner.query("SELECT count(*) FROM evals.assessment WHERE observation_id=$1", [old.id])).rows[0].count)).toBeGreaterThan(0);
    await expect(scoreRun(scope, run.id, "customer-manual-deterministic-v1")).rejects.toMatchObject({ code: "RETENTION_EXPIRED", status: 409 });
    await expect(createReportForRun(scope, { runId: run.id, title: "Again", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID())).rejects.toMatchObject({ code: "RETENTION_EXPIRED" });

    // Audited: the setting change (before/after) and the purge; one recovery event per answer.
    expect(await auditActions(orgId, "workspace.retention_changed")).toEqual([
      { action: "workspace.retention_changed", actor_id: ownerIdentity.user.id, details: { observation_days: { before: null, after: 30 } } },
    ]);
    expect(await auditActions(orgId, "retention.")).toEqual([
      { action: "retention.observations_purged", actor_id: service, details: { observations: 1, observation_days: 30, run_id: run.id } },
    ]);
    const events = (await owner.query("SELECT action,subject_type,subject_id FROM evals.recovery_control_event WHERE org_id=$1 AND action='observation_purged'", [orgId])).rows;
    expect(events).toEqual([{ action: "observation_purged", subject_type: "observation", subject_id: old.id }]);

    // Evidence stays immutable outside the purge transition, even for the table owner.
    await expect(owner.query("UPDATE evals.observation SET document=document||'{\"messages\":[]}' WHERE id=$1", [recent.id])).rejects.toMatchObject({ code: "55000" });
    await expect(owner.query("UPDATE evals.observation SET purged_at=now() WHERE id=$1", [recent.id])).rejects.toMatchObject({ code: "55000" });
    await expect(owner.query("DELETE FROM evals.observation WHERE id=$1", [purged.id])).rejects.toMatchObject({ code: "55000" });

    // A restore replays the recorded purge on the restored row.
    const snapshotAt = new Date(Date.now() - 60_000).toISOString();
    await asOwner(async (db) => {
      await db.query("INSERT INTO evals.recovery_control_event(org_id,action,subject_type,subject_id,actor_id,payload_hash) VALUES($1,'observation_purged','observation',$2,$3,$4)", [orgId, recent.id, service, "a".repeat(64)]);
    });
    const client = await owner.connect();
    try { await replayRecoveryControls(client, snapshotAt); } finally { client.release(); }
    expect((await state())[1].purged_at).not.toBeNull();
    // Clearing the setting returns to keeping everything, audited.
    expect(await setRetention(ownerIdentity, orgId, null)).toMatchObject({ observationDays: null, version: 2 });
    expect((await auditActions(orgId, "workspace.retention_changed")).at(-1)?.details).toEqual({ observation_days: { before: 30, after: null } });
    expect(await processRetention({ orgId, actorId: service })).toMatchObject({ selected: 0 });
  }, 60_000);

  it("exports everything an owner keeps as one ZIP: owner-only, audited, deleted on request or expiry", async () => {
    const { scoreRun, createReportForRun, publishReport } = await import("@/lib/evals/repositories/managed");
    const { tickWorkspaceExports, requestWorkspaceExport, openWorkspaceExport } = await import("@/lib/evals/operations/workspace-export");
    const { tickLifecycle } = await import("@/lib/evals/operations/lifecycle");
    const { scope, orgId, run, suiteVersionId } = await importedJudgeRunFixture(owner, urls.runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Claims assistant", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(scope, report.reportId, report.revisionId);
    const ownerIdentity = await person(orgId, "owner");
    const viewer = await person(orgId, "viewer");
    const operator = await person(orgId, "operator");
    const admin = await person(null, null, "platform_admin");
    const other = await importedJudgeRunFixture(owner, urls.runtimeUrl!);
    const otherOwner = await person(other.orgId, "owner");
    const collection = (method: string, body?: unknown, query = "") =>
      new Request(`http://localhost/api/evals/v1/exports/workspace${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const listRoute = await import("@/app/api/evals/v1/exports/workspace/route");
    const downloadRoute = await import("@/app/api/evals/v1/exports/workspace/[id]/download/route");
    const deleteRoute = await import("@/app/api/evals/v1/exports/workspace/[id]/route");

    // Off by default: the routes do not exist.
    vi.stubEnv("DATA_CONTROLS_ENABLED", "false");
    identity.current = ownerIdentity;
    expect((await listRoute.POST(collection("POST", { orgId }))).status).toBe(404);
    vi.stubEnv("DATA_CONTROLS_ENABLED", "true");

    // Only owners ask, list and download; operators, viewers and platform admins do not.
    for (const person of [viewer, operator, admin]) {
      identity.current = person;
      const response = await listRoute.POST(collection("POST", { orgId, locale: "en" }));
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("OWNER_REQUIRED");
    }
    identity.current = ownerIdentity;
    const created = (await (await listRoute.POST(collection("POST", { orgId, locale: "en" }))).json()).data;
    expect(created).toMatchObject({ status: "queued", downloadPath: null });
    // A second click returns the export already waiting.
    expect((await requestWorkspaceExport(ownerIdentity, orgId, "es")).id).toBe(created.id);
    // Another workspace's owner never sees it.
    identity.current = otherOwner;
    expect((await listRoute.GET(collection("GET", undefined, `?orgId=${orgId}`))).status).toBe(404);
    expect(await (await import("@/lib/evals/repositories/db")).withTenant({ orgId: other.orgId, actorId: otherOwner.user.id }, async (db) => (await db.query("SELECT id FROM evals.workspace_export WHERE id=$1", [created.id])).rowCount)).toBe(0);

    expect(await tickWorkspaceExports("service:data-controls-test")).toMatchObject({ processed: 1 });
    identity.current = ownerIdentity;
    const [ready] = (await (await listRoute.GET(collection("GET", undefined, `?orgId=${orgId}`))).json()).data;
    expect(ready).toMatchObject({ id: created.id, status: "completed", downloadPath: `/api/evals/v1/exports/workspace/${created.id}/download?orgId=${orgId}`, counts: { reports: 1, report_revisions: 1, runs: 1, observations: 2, test_sets: 1, test_set_versions: 1 } });
    expect(ready.fileName).toMatch(/^Caudals-workspace-export-judge-fixture-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(new Date(ready.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    identity.current = viewer;
    const refused = await downloadRoute.GET(new Request(`http://localhost${ready.downloadPath}`, { headers }));
    expect(refused.status).toBe(403);
    identity.current = ownerIdentity;
    const response = await downloadRoute.GET(new Request(`http://localhost${ready.downloadPath}`, { headers }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${ready.fileName}"`);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBe(ready.byteSize);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
    const folder = names.find((name) => name.startsWith("reports/001-claims-assistant/"))!.split("/").slice(0, 2).join("/");
    expect(names).toEqual([
      "README.txt", "manifest.json",
      `${folder}/report.en.html`,
      `${folder}/revisions/${report.revisionId}/evidence.cef.jsonl`,
      `${folder}/revisions/${report.revisionId}/results.csv`,
      `${folder}/revisions/${report.revisionId}/snapshot.json`,
      "reports/index.json",
      `runs/${run.id}.cef.jsonl`, "runs/index.json",
      "sources/index.json", "systems/index.json",
      `test-sets/001-judge-suite/${suiteVersionId}.cef.jsonl`, "test-sets/index.json",
    ].sort());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest).toMatchObject({ format: "caudals.workspace-export", workspace: { id: orgId }, export_id: created.id, locale: "en", retention: { observation_days: null }, warnings: [] });
    // Every listed file is in the archive with the recorded size and checksum.
    const { createHash } = await import("node:crypto");
    for (const file of manifest.files as Array<{ path: string; bytes: number; sha256: string }>) {
      const content = Buffer.from(await zip.file(file.path)!.async("uint8array"));
      expect([file.path, content.length, createHash("sha256").update(content).digest("hex")]).toEqual([file.path, file.bytes, file.sha256]);
    }
    const runLines = (await zip.file(`runs/${run.id}.cef.jsonl`)!.async("string")).trim().split("\n").map((line) => JSON.parse(line));
    expect(runLines[0]).toMatchObject({ record_type: "manifest", kind: "run", run_id: run.id, record_count: runLines.length - 1, observations_purged: 0 });
    expect(runLines.filter((line) => line.record_type === "observation")).toHaveLength(2);
    expect(runLines.filter((line) => line.record_type === "case")).toHaveLength(2);
    expect(runLines.filter((line) => line.record_type === "assessment").length).toBeGreaterThanOrEqual(2);
    const evidence = (await zip.file(`${folder}/revisions/${report.revisionId}/evidence.cef.jsonl`)!.async("string")).trim().split("\n").map((line) => JSON.parse(line));
    expect(evidence[0]).toMatchObject({ record_type: "manifest", report_revision_id: report.revisionId });
    expect(await zip.file(`${folder}/report.en.html`)!.async("string")).toContain("<html");
    expect(await zip.file("README.txt")!.async("string")).toContain("Caudals workspace export: Judge fixture");
    expect(JSON.parse(await zip.file("reports/index.json")!.async("string"))).toEqual([expect.objectContaining({ report_id: report.reportId, publication_status: "published", folder })]);

    const audit = await auditActions(orgId, "workspace.export_");
    expect(audit.map((row) => [row.action, row.actor_id])).toEqual([
      ["workspace.export_requested", ownerIdentity.user.id],
      ["workspace.export_completed", "service:data-controls-test"],
      ["workspace.export_downloaded", ownerIdentity.user.id],
    ]);

    // Deleting it removes it from the list now and its file at the next retention pass.
    const key = (await owner.query("SELECT object_key FROM evals.workspace_export WHERE id=$1", [created.id])).rows[0].object_key;
    expect(await exists(key)).toBe(true);
    identity.current = viewer;
    expect((await deleteRoute.DELETE(new Request(`http://localhost/api/evals/v1/exports/workspace/${created.id}?orgId=${orgId}`, { method: "DELETE", headers }))).status).toBe(403);
    identity.current = ownerIdentity;
    expect((await deleteRoute.DELETE(new Request(`http://localhost/api/evals/v1/exports/workspace/${created.id}?orgId=${orgId}`, { method: "DELETE", headers }))).status).toBe(200);
    expect((await (await listRoute.GET(collection("GET", undefined, `?orgId=${orgId}`))).json()).data).toEqual([]);
    await expect(openWorkspaceExport(ownerIdentity, orgId, created.id)).rejects.toMatchObject({ status: 404 });
    await tickLifecycle("service:data-controls-test");
    expect(await exists(key)).toBe(false);
    expect((await owner.query("SELECT status,object_deleted_at IS NOT NULL AS gone FROM evals.workspace_export WHERE id=$1", [created.id])).rows[0]).toEqual({ status: "deleted", gone: true });
    expect((await owner.query("SELECT action FROM evals.recovery_control_event WHERE org_id=$1 AND subject_id=$2", [orgId, created.id])).rows).toEqual([{ action: "export_deleted" }]);

    // An export left alone expires: its file is deleted and the download stops.
    const second = await requestWorkspaceExport(ownerIdentity, orgId, "es");
    await tickWorkspaceExports("service:data-controls-test");
    const secondKey = (await owner.query("SELECT object_key FROM evals.workspace_export WHERE id=$1", [second.id])).rows[0].object_key;
    const opened = await openWorkspaceExport(ownerIdentity, orgId, second.id);
    const spanish = await JSZip.loadAsync(Buffer.from(await new Response(opened.stream).arrayBuffer()));
    expect(await spanish.file("README.txt")!.async("string")).toContain("Exportación de un espacio de Caudals: Judge fixture");
    expect(Object.keys(spanish.files).some((name) => name.endsWith("/report.es.html"))).toBe(true);
    await owner.query("UPDATE evals.workspace_export SET expires_at=now()-interval '1 minute' WHERE id=$1", [second.id]);
    await tickLifecycle("service:data-controls-test");
    expect(await exists(secondKey)).toBe(false);
    expect((await owner.query("SELECT status FROM evals.workspace_export WHERE id=$1", [second.id])).rows[0].status).toBe("expired");
    await expect(openWorkspaceExport(ownerIdentity, orgId, second.id)).rejects.toMatchObject({ status: 404 });
  }, 90_000);

  it("exports a large workspace within the limits, and fails cleanly past them", async () => {
    const { tickWorkspaceExports, requestWorkspaceExport, processWorkspaceExport, WORKSPACE_EXPORT_LIMITS } = await import("@/lib/evals/operations/workspace-export");
    const { scoreRun, createReportForRun, publishReport } = await import("@/lib/evals/repositories/managed");
    const { scope, orgId, run, evaluationId, suiteVersionId, cases } = await importedJudgeRunFixture(owner, urls.runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Large", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(scope, report.reportId, report.revisionId);
    const ownerIdentity = await person(orgId, "owner");
    const RUNS = 40, UNITS = 100, REPORTS = 25;
    await asOwner(async (db) => {
      const base = (await db.query("SELECT document,target_revision_id FROM evals.observation o JOIN evals.run r ON r.id=o.run_id WHERE o.run_id=$1 LIMIT 1", [run.id])).rows[0];
      const runIds = (await db.query(`INSERT INTO evals.run(org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase,created_by)
        SELECT $1,$2,$3,$4,'imported_responses','completed','done',$5 FROM generate_series(1,$6) RETURNING id`, [orgId, evaluationId, base.target_revision_id, suiteVersionId, scope.actorId, RUNS])).rows.map((row) => row.id);
      await db.query(`INSERT INTO evals.case_unit(org_id,run_id,case_revision_id,repetition,status)
        SELECT $1,r.id,CASE WHEN g%2=0 THEN $2::uuid ELSE $3::uuid END,g,'succeeded' FROM unnest($4::uuid[]) AS r(id),generate_series(0,$5-1) AS g`, [orgId, cases[0].revision_id, cases[1].revision_id, runIds, UNITS]);
      await db.query(`INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,content_hash,document,execution_status)
        SELECT u.oid,u.org_id,u.run_id,u.id,encode(sha256(convert_to(u.oid::text,'UTF8')),'hex'),
          $2::jsonb || jsonb_build_object('observation_id',u.oid::text,'run_id',u.run_id::text,'repetition',u.repetition,
            'messages',jsonb_build_array(jsonb_build_object('role','user','content','Question number '||u.repetition),
              jsonb_build_object('role','assistant','content',repeat('A long answer that cites the policy section and its exceptions. ',50)||u.oid::text))),
          'succeeded'
        FROM (SELECT gen_random_uuid() AS oid,cu.* FROM evals.case_unit cu WHERE cu.org_id=$1 AND cu.run_id=ANY($3::uuid[])) u`, [orgId, base.document, runIds]);
      const snapshot = (await db.query("SELECT snapshot FROM evals.report_revision WHERE id=$1", [report.revisionId])).rows[0].snapshot;
      for (let index = 0; index < REPORTS; index++) {
        const reportId = randomUUID(), revisionId = randomUUID();
        await db.query("INSERT INTO evals.report(id,org_id,project_id,title,publication_status) SELECT $1,org_id,project_id,$2,'published' FROM evals.report WHERE id=$3", [reportId, `Large copy ${index}`, report.reportId]);
        await db.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status) VALUES($1,$2,$3,$4,$5,$6,'preliminary')", [revisionId, orgId, reportId, run.id, snapshot.content_hash, { ...snapshot, report_revision_id: revisionId }]);
        await db.query("UPDATE evals.report SET current_revision_id=$2 WHERE id=$1", [reportId, revisionId]);
      }
    }, scope.actorId, orgId);

    // Past the limits: the export fails with a reason the owner can act on, audited.
    const tooLarge = await requestWorkspaceExport(ownerIdentity, orgId, "en");
    expect(await processWorkspaceExport(orgId, "service:data-controls-test", { ...WORKSPACE_EXPORT_LIMITS, maxUncompressedBytes: 2 * 1024 * 1024 })).toBe(true);
    expect((await owner.query("SELECT status,reason_code,object_key FROM evals.workspace_export WHERE id=$1", [tooLarge.id])).rows[0]).toEqual({ status: "failed", reason_code: "export_too_large", object_key: null });
    expect((await auditActions(orgId, "workspace.export_failed")).map((row) => row.details)).toEqual([{ reason: "export_too_large" }]);

    // Within the production limits.
    const large = await requestWorkspaceExport(ownerIdentity, orgId, "en");
    const started = Date.now();
    expect(await tickWorkspaceExports("service:data-controls-test")).toMatchObject({ processed: 1 });
    const elapsed = Date.now() - started;
    const row = (await owner.query("SELECT status,byte_size,summary FROM evals.workspace_export WHERE id=$1", [large.id])).rows[0];
    expect(row.status).toBe("completed");
    expect(row.summary.counts).toMatchObject({ reports: REPORTS + 1, report_revisions: REPORTS + 1, runs: RUNS + 1, observations: RUNS * UNITS + 2 });
    expect(row.summary.uncompressed_bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect(row.summary.uncompressed_bytes).toBeLessThan(WORKSPACE_EXPORT_LIMITS.maxUncompressedBytes);
    expect(Number(row.byte_size)).toBeLessThan(WORKSPACE_EXPORT_LIMITS.maxZipBytes);
    expect(row.summary.duration_ms).toBeLessThan(WORKSPACE_EXPORT_LIMITS.maxDurationMs);
    console.info(JSON.stringify({ event: "large_export_fixture", observations: row.summary.counts.observations, entries: row.summary.entries, uncompressed_bytes: row.summary.uncompressed_bytes, zip_bytes: Number(row.byte_size), duration_ms: row.summary.duration_ms, elapsed_ms: elapsed }));
  }, 180_000);
});
