import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import JSZip from "jszip";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { createReportForRun, createReportShare, publishReport, queuePdfExport, resolveShare, scoreRun, shareExport } from "../../lib/evals/repositories/managed";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("shared report downloads on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

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
});
