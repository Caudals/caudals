/**
 * "Send to my vendor" (launch P-54) on PostgreSQL: a fix-list link reads the
 * fix list and its evidence and nothing else — not the report's sections,
 * not the answers outside the fixes, not its downloads, not another
 * revision — and keeps the share controls: open counts from
 * `share_access_event`, revocation and expiry. Creation refuses anything but
 * a private link with `fix_list` alone, on a current published report that
 * has fixes; `report_shared` records the scope.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { createReportShare, resolveShareWithContext, revokeShare, shareExport } from "../../lib/evals/repositories/managed";
import { listReportShares } from "../../lib/evals/repositories/operator-actions";
import { buildFixes, isFailing } from "../../lib/evals/reports/fixes";
import { projectFixList } from "../../lib/evals/reports/fix-list-share";
import { shareReferralCode } from "../../lib/evals/reports/referral";
import { reportFixtures } from "../../scripts/evals/report-fixtures";
import type { ReportSnapshot } from "../../lib/evals/reports/contracts";
import { POST as exchange } from "../../app/api/evals/v1/share/exchange/route";
import { POST as exportRoute } from "../../app/api/evals/v1/share/export/route";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const day = 86_400_000;

/** The example report (48 answers, seven fix groups): two failed groups fall outside the top five. */
const example = reportFixtures().find((item) => item.name === "example-en")!.report;

(ownerUrl && runtimeUrl ? describe : describe.skip)("vendor fix-list links on PostgreSQL (launch P-54)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let ctx: Awaited<ReturnType<typeof importedJudgeRunFixture>>;
  beforeAll(async () => {
    vi.stubEnv("ANALYTICS_EVENTS_V2", "true");
    ctx = await importedJudgeRunFixture(owner, runtimeUrl!);
  });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); vi.unstubAllEnvs(); });

  /** A published report of the fixture's run whose current revision holds `results`. */
  async function publishedReport(results: ReportSnapshot["results"], reportId: string = randomUUID()) {
    const revisionId = randomUUID();
    const snapshot: ReportSnapshot = { ...example, report_revision_id: revisionId, run_id: ctx.run.id, content_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"), results,
      findings: example.findings.map((item) => ({ ...item, assessment_ids: item.assessment_ids.filter((id) => results.some((result) => result.assessment_id === id)) })),
      takeaways: example.takeaways.map((item) => ({ ...item, assessment_ids: item.assessment_ids.filter((id) => results.some((result) => result.assessment_id === id)) })) };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [ctx.actorId, ctx.orgId]);
      await db.query("INSERT INTO evals.report(id,org_id,project_id,title) VALUES($1,$2,$3,'Vendor fix list') ON CONFLICT (id) DO NOTHING", [reportId, ctx.orgId, ctx.projectId]);
      await db.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status) VALUES($1,$2,$3,$4,$5,$6,'preliminary')", [revisionId, ctx.orgId, reportId, ctx.run.id, snapshot.content_hash, snapshot]);
      await db.query("UPDATE evals.report SET current_revision_id=$3,publication_status='published' WHERE org_id=$1 AND id=$2", [ctx.orgId, reportId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    return { reportId, revisionId, snapshot };
  }
  const fixList = (reportId: string, revisionId: string, extra: Record<string, unknown> = {}) =>
    createReportShare(ctx.scope, reportId, { reportRevisionId: revisionId, audience: "bearer", expiresAt: new Date(Date.now() + 30 * day).toISOString(), permittedFields: ["fix_list"], ...extra }, randomUUID());
  const call = (path: string, body: unknown) => new Request(`https://app.caudals.com${path}`, { method: "POST", headers: { origin: "https://app.caudals.com", host: "app.caudals.com", "content-type": "application/json" }, body: JSON.stringify(body) });
  const accesses = (shareId: string) => withTenant(ctx.scope, async (db) => (await db.query("SELECT action FROM evals.share_access_event WHERE org_id=$1 AND share_id=$2 ORDER BY id", [ctx.orgId, shareId])).rows.map((row) => row.action));

  it("opens the fix list and its evidence, and nothing else of the report", async () => {
    const report = await publishedReport(example.results);
    const share = await fixList(report.reportId, report.revisionId);
    const token = String(share.token);
    const expected = projectFixList(report.snapshot);
    const members = new Set(expected.results.map((item) => item.assessment_id));
    const outside = example.results.filter((item) => !members.has(item.assessment_id));
    expect(outside.filter(isFailing).length).toBeGreaterThan(0);

    // Through the repository.
    const view = await resolveShareWithContext(token, randomUUID());
    expect(view.report).toEqual(expected);
    expect(view.share).toMatchObject({ label: null, scope: "fix_list" });
    expect(new Date(view.share.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 29 * day);
    expect(view.referral).toBe(await shareReferralCode(ctx.orgId));

    // Through the page's exchange endpoint: the same data, and none of the report's sections or other answers.
    const response = await exchange(call("/api/evals/v1/share/exchange", { token }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(body.meta.share.scope).toBe("fix_list");
    expect(Object.keys(body.data).sort()).toEqual(["created_at", "report_revision_id", "results", "review_status", "scope", "system"]);
    const text = JSON.stringify(body);
    for (const key of ["metrics", "findings", "methodology", "takeaways", "improvements", "strict_pass_rate", "content_hash", "run_id", "observation_id", "source_refs"]) expect(text).not.toContain(`"${key}"`);
    for (const item of outside) {
      expect(text).not.toContain(`"${item.assessment_id}"`);
      expect(text).not.toContain(JSON.stringify(item.input));
    }
    for (const finding of example.findings) expect(text).not.toContain(JSON.stringify(finding.observation));
    expect(text).not.toContain(ctx.orgId);
    // The vendor's page rebuilds the owner's fixes.
    expect(buildFixes(body.data.results, "es")).toEqual(buildFixes(example.results, "es"));
    expect(await accesses(share.id)).toEqual(["view", "view"]);
  });

  it("offers no download of the report or its results", async () => {
    const report = await publishedReport(example.results);
    const share = await fixList(report.reportId, report.revisionId);
    const token = String(share.token);
    for (const kind of ["pdf", "docx", "csv", "cef"] as const) {
      await expect(shareExport(token, randomUUID(), kind, "en")).rejects.toMatchObject({ status: 404 });
      const response = await exportRoute(call("/api/evals/v1/share/export", { token, kind, locale: "en" }));
      expect(response.status).toBe(404);
    }
    const jobs = await withTenant(ctx.scope, async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.export_job WHERE org_id=$1 AND share_id=$2", [ctx.orgId, share.id])).rows[0].n);
    expect(jobs).toBe(0);
    // Refused downloads are not accesses.
    expect(await accesses(share.id)).toEqual([]);
  });

  it("counts opens for the owner, and records report_shared with its scope", async () => {
    const report = await publishedReport(example.results);
    const share = await fixList(report.reportId, report.revisionId, { expiresAt: new Date(Date.now() + 7 * day).toISOString() });
    const full = await createReportShare(ctx.scope, report.reportId, { reportRevisionId: report.revisionId, audience: "bearer", expiresAt: new Date(Date.now() + 7 * day).toISOString(), permittedFields: ["system", "metrics"] }, randomUUID());
    const listed = async () => (await listReportShares(ctx.scope, report.reportId)).find((item: { id: string }) => item.id === share.id);
    expect(await listed()).toMatchObject({ permitted_fields: ["fix_list"], open_count: 0, last_opened_at: null });
    await resolveShareWithContext(String(share.token), randomUUID());
    await exchange(call("/api/evals/v1/share/exchange", { token: share.token }));
    const row = await listed();
    expect(row).toMatchObject({ open_count: 2, access_count: 2 });
    expect(new Date(row.last_opened_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const events = (await owner.query("SELECT metadata FROM public.product_analytics_event WHERE org_id=$1 AND event_name='report_shared' ORDER BY occurred_at", [ctx.orgId])).rows.map((item) => item.metadata);
    expect(events).toContainEqual({ scope: "fix_list" });
    expect(events).toContainEqual({ scope: "report" });
    // A report share is unchanged: its sections, with the scope named.
    const view = await resolveShareWithContext(String(full.token), randomUUID());
    expect(Object.keys(view.report)).toEqual(expect.arrayContaining(["system", "metrics"]));
    expect(view.share).toMatchObject({ scope: "report", expiresAt: null });
  });

  it("stops at revocation and at expiry", async () => {
    const report = await publishedReport(example.results);
    const revoked = await fixList(report.reportId, report.revisionId);
    expect((await resolveShareWithContext(String(revoked.token), randomUUID())).share.scope).toBe("fix_list");
    await revokeShare(ctx.scope, revoked.id);
    await expect(resolveShareWithContext(String(revoked.token), randomUUID())).rejects.toMatchObject({ status: 404 });
    expect((await exchange(call("/api/evals/v1/share/exchange", { token: revoked.token }))).status).toBe(404);
    expect((await listReportShares(ctx.scope, report.reportId)).find((item: { id: string }) => item.id === revoked.id).revoked_at).toBeTruthy();

    const expired = await fixList(report.reportId, report.revisionId);
    await owner.query("UPDATE evals.share_grant SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
    await expect(resolveShareWithContext(String(expired.token), randomUUID())).rejects.toMatchObject({ status: 404 });
    expect((await exchange(call("/api/evals/v1/share/exchange", { token: expired.token }))).status).toBe(404);
    // Neither a refused open counts.
    expect(await accesses(expired.id)).toEqual([]);
  });

  it("is bound to its revision: a newer one is never readable through it", async () => {
    const first = await publishedReport(example.results);
    const share = await fixList(first.reportId, first.revisionId);
    expect((await resolveShareWithContext(String(share.token), randomUUID())).report).toMatchObject({ report_revision_id: first.revisionId });
    // The owner publishes a new revision of the same report.
    const reversed = [...example.results].reverse().map((item) => ({ ...item, input: `${item.input} (rev 2)` }));
    const second = await publishedReport(reversed, first.reportId);
    await expect(resolveShareWithContext(String(share.token), randomUUID())).rejects.toMatchObject({ status: 404 });
    const response = await exchange(call("/api/evals/v1/share/exchange", { token: share.token }));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("(rev 2)");
    // The older revision can no longer be sent; the current one can.
    await expect(fixList(first.reportId, first.revisionId)).rejects.toMatchObject({ status: 404 });
    const current = await fixList(second.reportId, second.revisionId);
    const view = await resolveShareWithContext(String(current.token), randomUUID());
    expect(view.report).toMatchObject({ report_revision_id: second.revisionId });
    expect(JSON.stringify(view.report)).not.toContain(first.revisionId);
  });

  it("refuses anything but a private link with the fix list alone, on a report with fixes", async () => {
    const report = await publishedReport(example.results);
    const base = { reportRevisionId: report.revisionId, expiresAt: new Date(Date.now() + day).toISOString() };
    await expect(createReportShare(ctx.scope, report.reportId, { ...base, audience: "bearer", permittedFields: ["fix_list", "results"] }, randomUUID())).rejects.toMatchObject({ code: "INPUT_INVALID", status: 400 });
    await expect(createReportShare(ctx.scope, report.reportId, { ...base, audience: "workspace", permittedFields: ["fix_list"] }, randomUUID())).rejects.toMatchObject({ code: "INPUT_INVALID", status: 400 });
    await expect(createReportShare(ctx.scope, report.reportId, { ...base, audience: "named_recipient", recipient: "vendor@example.test", permittedFields: ["fix_list"] }, randomUUID())).rejects.toMatchObject({ code: "INPUT_INVALID", status: 400 });
    const passing = await publishedReport(example.results.filter((item) => item.outcome === "pass"));
    await expect(fixList(passing.reportId, passing.revisionId)).rejects.toMatchObject({ code: "INPUT_INVALID", status: 400 });
    // Nothing was recorded for the refused requests.
    const grants = await withTenant(ctx.scope, async (db) => (await db.query("SELECT permitted_fields,audience FROM evals.share_grant g JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(g.org_id,g.report_revision_id) WHERE g.org_id=$1 AND rr.report_id = ANY($2::uuid[])", [ctx.orgId, [report.reportId, passing.reportId]])).rows);
    expect(grants).toEqual([]);
  });
});
