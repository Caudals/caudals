import { afterAll, describe, expect, it, vi } from "vitest";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import JSZip from "jszip";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { createMachineExport, createReportForRun, createReportShare, getReportArtifact, publishReport, queuePdfExport, resolveShare, resolveShareWithContext, scoreRun, shareExport } from "../../lib/evals/repositories/managed";
import { listReportShares } from "../../lib/evals/repositories/operator-actions";
import { shareReferralCode } from "../../lib/evals/reports/referral";
import { objectKey } from "../../lib/evals/storage/private";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;

(ownerUrl && runtimeUrl ? describe : describe.skip)("shared report downloads on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); vi.unstubAllEnvs(); });

  it("serves only the shared sections, queues a share-scoped PDF and counts delivered files only", async () => {
    const { scope, orgId, run } = await importedJudgeRunFixture(owner, runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Shared", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(scope, report.reportId, report.revisionId);
    const share = await createReportShare(scope, report.reportId, { reportRevisionId: report.revisionId, audience: "bearer", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), permittedFields: ["system", "metrics", "findings"] }, randomUUID());
    const token = String(share.token);
    const events = async () => withTenant(scope, async (c) => (await c.query("SELECT action FROM evals.share_access_event WHERE org_id=$1 AND share_id=$2 ORDER BY id", [orgId, share.id])).rows.map((row) => row.action));

    expect(Object.keys(await resolveShare(token, randomUUID()))).not.toContain("results");

    const word = await shareExport(token, randomUUID(), "docx", "es");
    expect(word.status).toBe("ready");
    const xml = await (await JSZip.loadAsync((word as { bytes: Buffer }).bytes)).file("word/document.xml")!.async("string");
    expect(xml).not.toContain("What fee applies under policy A?");
    expect(xml).toContain("Copia compartida");
    await expect(shareExport(token, randomUUID(), "csv", "en")).rejects.toMatchObject({ status: 404 });
    await expect(shareExport(token, randomUUID(), "cef", "en")).rejects.toMatchObject({ status: 404 });

    expect(await shareExport(token, randomUUID(), "pdf", "en")).toEqual({ status: "preparing" });
    expect(await shareExport(token, randomUUID(), "pdf", "en")).toEqual({ status: "preparing" });
    const jobs = await withTenant(scope, async (c) => (await c.query("SELECT id,share_id,permitted_fields FROM evals.export_job WHERE org_id=$1", [orgId])).rows);
    expect(jobs).toEqual([{ id: expect.any(String), share_id: share.id, permitted_fields: ["system", "metrics", "findings"] }]);
    // The workspace's own PDF never reuses the redacted share job.
    const own = await queuePdfExport(scope, report.revisionId, "en");
    expect(own.id).not.toBe(jobs[0].id);

    // Polling a queued PDF is not an access; the Word file was.
    expect(await events()).toEqual(["view", "download"]);

    // A failed share render is reported without notifying the workspace.
    await owner.query("UPDATE evals.export_job SET status='failed',reason_code='pdf_render_failed',updated_at=now() WHERE id=$1", [jobs[0].id]);
    expect(await shareExport(token, randomUUID(), "pdf", "en")).toEqual({ status: "failed" });
    const notices = await withTenant(scope, async (c) => (await c.query("SELECT kind FROM evals.notification WHERE org_id=$1 AND kind LIKE 'export%'", [orgId])).rows);
    expect(notices).toEqual([]);

    await expect(shareExport("A".repeat(43), randomUUID(), "docx", "en")).rejects.toMatchObject({ status: 404 });
  });
  it("counts page opens for the owner and carries a hashed referral (launch L-17)", async () => {
    const { scope, orgId, run } = await importedJudgeRunFixture(owner, runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Opens", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(scope, report.reportId, report.revisionId);
    const share = await createReportShare(scope, report.reportId, { reportRevisionId: report.revisionId, audience: "bearer", expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), permittedFields: ["system", "metrics", "findings"] }, randomUUID());
    const token = String(share.token);
    const listed = async () => (await listReportShares(scope, report.reportId)).find((item: { id: string }) => item.id === share.id);

    expect(await listed()).toMatchObject({ open_count: 0, last_opened_at: null, access_count: 0 });
    const view = await resolveShareWithContext(token, randomUUID());
    expect(view.referral).toBe(await shareReferralCode(orgId));
    expect(view.referral).toMatch(/^sr-[0-9a-f]{12}$/);
    expect(view.referral).not.toContain(orgId.slice(0, 8));
    await resolveShare(token, randomUUID());
    expect((await shareExport(token, randomUUID(), "docx", "en")).status).toBe("ready");
    const row = await listed();
    // Downloads are accesses, not opens.
    expect(row).toMatchObject({ open_count: 2, access_count: 3 });
    expect(new Date(row.last_opened_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  (endpoint ? it : it.skip)("renders report files again after a layout change, then reuses them (launch L-17)", async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint!, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-report-v2-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "evals-report-v2-test" })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }

    const { scope, orgId, projectId, run } = await importedJudgeRunFixture(owner, runtimeUrl!);
    await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(scope, { runId: run.id, title: "Layout", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());

    // Word: stored under the current layout's path and reused.
    const word = await createMachineExport(scope, report.revisionId, "docx", "en");
    const again = await createMachineExport(scope, report.revisionId, "docx", "en");
    expect(again.artifactId).toBe(word.artifactId);
    const stored = await getReportArtifact(scope, word.artifactId);
    expect(stored.export_path).toBe(`reports/${report.revisionId}.en.v2.docx`);
    expect(stored.report_created_at).toBeTruthy();

    // PDF: a file made with the earlier layout is rendered again; a current one is reused.
    const fake = async (path: string) => {
      const id = randomUUID();
      await owner.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,'customer',$5,$6,1,'application/pdf','ready',now()+interval '1 day')", [id, orgId, projectId, path, objectKey(orgId, id, true), "a".repeat(64)]);
      return id;
    };
    const first = await queuePdfExport(scope, report.revisionId, "en");
    await owner.query("UPDATE evals.export_job SET status='completed',artifact_id=$2,updated_at=now() WHERE id=$1", [first.id, await fake(`reports/${report.revisionId}.pdf`)]);
    const second = await queuePdfExport(scope, report.revisionId, "en");
    expect(second.id).not.toBe(first.id);
    await owner.query("UPDATE evals.export_job SET status='completed',artifact_id=$2,updated_at=now() WHERE id=$1", [second.id, await fake(`reports/${report.revisionId}.v2.pdf`)]);
    expect((await queuePdfExport(scope, report.revisionId, "en")).id).toBe(second.id);
  });
});
