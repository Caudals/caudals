/**
 * Expert review from request to reviewed report on the real schema (launch
 * L-26, migration 101, spec P-10, P-32, P-33), through the API routes:
 *
 * - a request creates exactly one ops task, one Warmbly CRM draft (never
 *   sent) and one email to the internal address (fake sender);
 * - an order creates one redacted assignment per ready expert, and refuses
 *   an expert whose onboarding checklist is incomplete;
 * - experts see only their own redacted assignment, through every route and
 *   by direct query, never orders, requests, drafts or other assignments;
 * - the reviewed revision carries "Reviewed by N experts on <date>, scope …"
 *   with N recorded reviewers, notifies the customer and tracks time to
 *   review; the database refuses a label without recorded reviewers (I-7).
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));
// No email leaves: the founders' notice goes to a stand-in sender.
const mail = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text: string }, _options?: unknown) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const INTERNAL = "ops-internal@caudals.test";
const WORKSPACE = "Hogarel Seguros fixture";

describe.skipIf(!ownerUrl || !runtimeUrl)("expert review orders on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  let orgId = "", reportId = "", revisionId = "", requestId = "", orderId = "", runId = "";
  const users = { owner: "", viewer: "", ops: "", expertA: "", expertB: "", expertC: "", outsider: "" };
  const profiles = { A: "", B: "", C: "" };
  let assignments: string[] = [];
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
  const call = (path: string, method: string, body?: unknown, extra: Record<string, string> = {}) =>
    new Request(`http://localhost/api/evals/v1${path}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const as = (who: keyof typeof users) => {
    const role = who === "owner" ? "owner" : who === "viewer" ? "viewer" : who === "ops" ? "operator" : null;
    identity.current = {
      user: { id: users[who], email: `${who}@example.test`, name: who },
      platformRole: who === "ops" ? "operator" : null,
      workspaces: role ? [{ id: orgId, name: WORKSPACE, role }] : [],
    };
  };
  async function asActor<T>(actor: string, org: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)", [org, actor]);
      return await work(db);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      db.release();
    }
  }
  const requestRoute = () => import("@/app/api/evals/v1/reports/[id]/expert-review/route");
  const listRoute = () => import("@/app/api/evals/v1/expert-reviews/route");
  const detailRoute = () => import("@/app/api/evals/v1/expert-reviews/[id]/route");
  const excerptsRoute = () => import("@/app/api/evals/v1/expert-reviews/[id]/excerpts/route");
  const orderRoute = () => import("@/app/api/evals/v1/expert-reviews/[id]/order/route");
  const benchRoute = () => import("@/app/api/evals/v1/expert-bench/route");
  const benchItemRoute = () => import("@/app/api/evals/v1/expert-bench/[id]/route");
  const reviewRoute = () => import("@/app/api/evals/v1/review/assignments/route");
  const reviewItemRoute = () => import("@/app/api/evals/v1/review/assignments/[id]/route");
  const operatorAssignments = () => import("@/app/api/evals/v1/expert-assignments/route");
  const requestBody = { surface: "report", scopeKind: "failed_answers", scopeNote: "Fees and rounding", deadline: null, sector: "insurance", locale: "en" };
  const checklist = {
    credentials_verified_at: "2026-10-01T12:00:00.000Z", contract_signed_at: "2026-10-02T12:00:00.000Z", ip_assignment: true, confidentiality: true,
    dpa_signed_at: "2026-10-02T12:00:00.000Z", trial_gold_items: 20, trial_agreement: 0.9, agreement_threshold: 0.8,
    trial_completed_at: "2026-10-05T12:00:00.000Z", trial_paid_at: "2026-10-06T12:00:00.000Z", sectors: ["insurance"], availability: "available", hours_per_week: 8, notes: null,
  };

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    vi.stubEnv("EVALS_EXPERT_WORK_ENABLED", "true");
    vi.stubEnv("COLLABORATION_NOTIFICATION_EMAIL", INTERNAL);
    vi.stubEnv("RESEND_FROM_EMAIL", "Caudals <noreply@caudals.test>");
    const { scoreRun, createReportForRun, publishReport } = await import("@/lib/evals/repositories/managed");
    const fixture = await importedJudgeRunFixture(owner, runtimeUrl!);
    orgId = fixture.orgId;
    runId = fixture.run.id;
    await owner.query("UPDATE evals.workspace SET name=$2 WHERE id=$1", [orgId, WORKSPACE]);
    await scoreRun(fixture.scope, fixture.run.id, "customer-manual-deterministic-v1");
    const report = await createReportForRun(fixture.scope, { runId: fixture.run.id, title: "Hogarel assistant check", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    await publishReport(fixture.scope, report.reportId, report.revisionId);
    reportId = report.reportId;
    revisionId = report.revisionId;
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      users[who] = createPrefixedId("au");
      await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [users[who], who, `${randomUUID()}@example.test`]);
    }
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer'),($1,$4,'operator')", [orgId, users.owner, users.viewer, users.ops]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [users.ops]);
    const outsiderOrg = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Other',$2)", [outsiderOrg, users.outsider]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [outsiderOrg, users.outsider]);
    const { createExpertProfile } = await import("@/lib/evals/experts/store");
    for (const [key, user] of [["A", users.expertA], ["B", users.expertB], ["C", users.expertC]] as const) {
      profiles[key] = (await createExpertProfile(users.ops, {
        userId: user, domains: ["insurance"], jurisdictions: ["ES"], languages: ["es-ES"],
        credentialsStatus: "verified", termsStatus: "accepted", eligibilityStatus: "eligible",
      })).id;
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    await runtime.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("is invisible while EXPERT_REVIEW_ORDERS_ENABLED is off", async () => {
    vi.stubEnv("EXPERT_REVIEW_ORDERS_ENABLED", "");
    as("owner");
    const { GET, POST } = await requestRoute();
    expect((await GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).status).toBe(404);
    expect((await POST(call(`/reports/${reportId}/expert-review`, "POST", { orgId, ...requestBody }))).status).toBe(404);
    as("ops");
    expect((await (await listRoute()).GET(call("/expert-reviews", "GET"))).status).toBe(404);
    expect((await (await benchRoute()).GET(call("/expert-bench", "GET"))).status).toBe(404);
    expect(mail).not.toHaveBeenCalled();
  });

  it("a request creates one ops task, one unsent CRM draft and one internal email", async () => {
    vi.stubEnv("EXPERT_REVIEW_ORDERS_ENABLED", "true");
    const { GET, POST } = await requestRoute();
    as("viewer");
    expect((await POST(call(`/reports/${reportId}/expert-review`, "POST", { orgId, ...requestBody }))).status).toBe(404);
    as("outsider");
    expect((await GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).status).toBe(404);
    as("owner");
    expect((await (await GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).json()).data.request).toBeNull();
    const first = await POST(call(`/reports/${reportId}/expert-review`, "POST", { orgId, ...requestBody }));
    expect(first.status).toBe(200);
    const body = (await first.json()).data;
    expect(body).toMatchObject({ created: true, request: { status: "requested", scopeKind: "failed_answers", dueAt: null } });
    requestId = body.request.id;
    // One working day (Europe/Madrid, weekends skipped).
    const madridDay = (value: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Madrid" }).format(new Date(value));
    const gap = (Date.parse(body.request.replyDueAt) - Date.parse(body.request.createdAt)) / 3_600_000;
    expect(gap).toBeGreaterThanOrEqual(23);
    expect(gap).toBeLessThanOrEqual(73);
    expect(["Sat", "Sun"]).not.toContain(madridDay(body.request.replyDueAt));
    // A second click returns the open request: still one task, one draft, one email.
    const again = (await (await POST(call(`/reports/${reportId}/expert-review`, "POST", { orgId, ...requestBody, scopeKind: "whole_report" }))).json()).data;
    expect(again).toMatchObject({ created: false, request: { id: requestId } });
    const rows = await owner.query("SELECT count(*)::int AS n FROM evals.review_request WHERE org_id=$1", [orgId]);
    expect(rows.rows[0].n).toBe(1);
    const draft = (await owner.query("SELECT summary FROM evals.review_crm_draft WHERE org_id=$1 AND request_id=$2", [orgId, requestId])).rows;
    expect(draft).toHaveLength(1);
    expect(draft[0].summary).toMatchObject({ kind: "expert_review_request", destination: "warmbly", sent: false, request_id: requestId, company: WORKSPACE, report_id: reportId, request: { scope_kind: "failed_answers", sector: "insurance" } });
    expect(mail).toHaveBeenCalledTimes(1);
    const [message, options] = mail.mock.calls[0];
    expect(message.to).toBe(INTERNAL);
    expect(message.subject).toContain(WORKSPACE);
    expect(message.text).toContain(`/ops/experts/reviews/${requestId}`);
    expect(message.text).not.toContain("owner@example.test");
    expect(message.text).not.toContain("Fees and rounding");
    expect(options).toEqual({ idempotencyKey: `expert-review-request-${requestId}` });
    const notified = await owner.query("SELECT notified_at IS NOT NULL AS done FROM evals.review_request WHERE id=$1", [requestId]);
    expect(notified.rows[0].done).toBe(true);
    const audit = await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action IN ('review_request.created','crm_handoff_draft.created') ORDER BY action", [orgId]);
    expect(audit.rows.map((row) => row.action)).toEqual(["crm_handoff_draft.created", "review_request.created"]);
    // Customers read their request; the draft and orders are staff-only.
    await asActor(users.owner, orgId, async (db) => {
      expect((await db.query("SELECT count(*)::int AS n FROM evals.review_request")).rows[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM evals.review_crm_draft")).rows[0].n).toBe(0);
      await expect(db.query("INSERT INTO evals.review_request(org_id,report_id,report_revision_id,surface,scope_kind,sector,locale,requested_by,reply_due_at) VALUES($1,$2,$3,'report','pilot','other','en',$4,now())",
        [orgId, reportId, revisionId, users.owner])).rejects.toThrow(/permission denied/);
    });
    // The draft can never be marked as sent.
    await expect(owner.query("UPDATE evals.review_crm_draft SET summary=summary||'{\"sent\":true}' WHERE request_id=$1", [requestId])).rejects.toThrow();
    await expect(owner.query("INSERT INTO evals.review_crm_draft(org_id,request_id,summary,created_by) VALUES($1,$2,'{\"sent\":true,\"destination\":\"warmbly\"}',$3)", [orgId, requestId, users.ops])).rejects.toThrow();
  });

  it("the bench checklist gates order work", async () => {
    as("ops");
    const { GET } = await benchRoute();
    const { PUT } = await benchItemRoute();
    for (const id of [profiles.A, profiles.B]) expect((await PUT(call(`/expert-bench/${id}`, "PUT", checklist))).status).toBe(200);
    const saved = await PUT(call(`/expert-bench/${profiles.C}`, "PUT", { ...checklist, ip_assignment: false, trial_agreement: 0.6 }));
    expect((await saved.json()).data).toEqual({ ready: false });
    const bench = (await (await GET(call("/expert-bench", "GET"))).json()).data as Array<{ id: string; ready: boolean; missing: string[] }>;
    expect(bench.find((row) => row.id === profiles.A)).toMatchObject({ ready: true, missing: [] });
    expect(bench.find((row) => row.id === profiles.C)).toMatchObject({ ready: false, missing: ["ip_assignment", "agreement"] });
    as("owner");
    expect((await GET(call("/expert-bench", "GET"))).status).toBe(404);
    expect((await PUT(call(`/expert-bench/${profiles.A}`, "PUT", checklist))).status).toBe(404);
  });

  it("an order creates redacted assignments for ready experts only", async () => {
    as("ops");
    const detail = (await (await (await detailRoute()).GET(call(`/expert-reviews/${requestId}`, "GET"))).json()).data;
    expect(detail.request).toMatchObject({ id: requestId, status: "requested" });
    expect(detail.draft.summary.sent).toBe(false);
    const resultIds: string[] = detail.results.map((item: { id: string }) => item.id);
    expect(resultIds.length).toBeGreaterThan(0);
    const preview = (await (await (await excerptsRoute()).POST(call(`/expert-reviews/${requestId}/excerpts`, "POST", { resultIds }))).json()).data;
    expect(preview.excerpts).toHaveLength(resultIds.length);
    expect(JSON.stringify(preview)).not.toMatch(/hogarel/i);
    const { POST } = await orderRoute();
    const order = {
      orgId, scope: "the two answers about fees and rounding", sector: "insurance", dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      quoteAmount: "900.00", quoteCurrency: "EUR", quoteNote: "Two experts, invoiced by hand on delivery.", resultIds, conflictsCleared: true,
    };
    // An expert whose checklist is incomplete undoes the whole order.
    const refused = await POST(call(`/expert-reviews/${requestId}/order`, "POST", { ...order, expertProfileIds: [profiles.A, profiles.C] }, { "Idempotency-Key": randomUUID() }));
    expect(refused.status).toBe(422);
    expect((await refused.json()).error.code).toBe("EXPERT_NOT_READY");
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.review_order WHERE org_id=$1", [orgId])).rows[0].n).toBe(0);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.expert_assignment WHERE org_id=$1", [orgId])).rows[0].n).toBe(0);
    // Customers cannot create orders.
    as("owner");
    expect((await POST(call(`/expert-reviews/${requestId}/order`, "POST", { ...order, expertProfileIds: [profiles.A] }, { "Idempotency-Key": randomUUID() }))).status).toBe(404);
    as("ops");
    const key = randomUUID();
    const created = await POST(call(`/expert-reviews/${requestId}/order`, "POST", { ...order, expertProfileIds: [profiles.A, profiles.B] }, { "Idempotency-Key": key }));
    expect(created.status).toBe(200);
    const result = (await created.json()).data;
    orderId = result.orderId;
    assignments = result.assignmentIds;
    expect(assignments).toHaveLength(2);
    expect(result.excerptCount).toBe(resultIds.length);
    const replay = (await (await POST(call(`/expert-reviews/${requestId}/order`, "POST", { ...order, expertProfileIds: [profiles.A, profiles.B] }, { "Idempotency-Key": key }))).json()).data;
    expect(replay.orderId).toBe(orderId);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.expert_assignment WHERE org_id=$1", [orgId])).rows[0].n).toBe(2);
    const stored = (await owner.query(`SELECT o.status,o.quote_amount::text AS quote,o.quote_currency,r.status AS request_status,r.due_at IS NOT NULL AS due,
        (SELECT count(*)::int FROM evals.review_order_assignment l WHERE l.order_id=o.id) AS links
      FROM evals.review_order o JOIN evals.review_request r ON r.id=o.request_id WHERE o.id=$1`, [orderId])).rows[0];
    expect(stored).toEqual({ status: "open", quote: "900.00", quote_currency: "EUR", request_status: "ordered", due: true, links: 2 });
    // The evidence each expert receives is the redacted excerpts, without ids or names.
    const evidence = (await owner.query("SELECT snapshot FROM evals.expert_assignment_evidence WHERE org_id=$1", [orgId])).rows.map((row) => JSON.stringify(row.snapshot));
    expect(evidence).toHaveLength(2);
    const snapshot = (await owner.query("SELECT snapshot FROM evals.report_revision WHERE id=$1", [revisionId])).rows[0].snapshot;
    for (const text of evidence) {
      expect(text).not.toMatch(/hogarel/i);
      for (const item of snapshot.results) {
        expect(text).not.toContain(item.assessment_id);
        expect(text).not.toContain(item.case_revision_id);
      }
      expect(text).not.toContain(orgId);
      expect(text).not.toContain(reportId);
    }
    // Customers see the order's due date on their request, never the quote.
    as("owner");
    const customer = (await (await (await requestRoute()).GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).json()).data.request;
    expect(customer).toMatchObject({ status: "ordered" });
    expect(customer.dueAt).not.toBeNull();
    expect(JSON.stringify(customer)).not.toContain("900");
    await asActor(users.owner, orgId, async (db) => {
      expect((await db.query("SELECT count(*)::int AS n FROM evals.review_order")).rows[0].n).toBe(0);
      expect((await db.query("SELECT count(*)::int AS n FROM evals.review_order_assignment")).rows[0].n).toBe(0);
      expect((await db.query("SELECT count(*)::int AS n FROM evals.expert_onboarding")).rows[0].n).toBe(0);
    });
  });

  it("experts see only their own redacted assignment, through every route and query", async () => {
    const [mine, theirs] = assignments;
    as("expertA");
    const list = (await (await (await reviewRoute()).GET(call("/review/assignments", "GET"))).json()).data as Array<{ id: string }>;
    expect(list.map((row) => row.id)).toEqual([mine]);
    const own = await (await reviewItemRoute()).GET(call(`/review/assignments/${mine}`, "GET"));
    const ownBody = JSON.stringify((await own.json()).data);
    expect(own.status).toBe(200);
    expect(ownBody).not.toMatch(/hogarel/i);
    for (const hidden of [orgId, reportId, revisionId, requestId, orderId, runId, "900", "Two experts, invoiced"]) expect(ownBody).not.toContain(hidden);
    expect((await (await reviewItemRoute()).GET(call(`/review/assignments/${theirs}`, "GET"))).status).toBe(404);
    // Operator and customer routes answer 404 to an expert.
    expect((await (await listRoute()).GET(call("/expert-reviews", "GET"))).status).toBe(404);
    expect((await (await detailRoute()).GET(call(`/expert-reviews/${requestId}`, "GET"))).status).toBe(404);
    expect((await (await excerptsRoute()).POST(call(`/expert-reviews/${requestId}/excerpts`, "POST", { resultIds: ["x"] }))).status).toBe(404);
    expect((await (await orderRoute()).PATCH(call(`/expert-reviews/${requestId}/order`, "PATCH", { action: "publish", orderId }))).status).toBe(404);
    expect((await (await benchRoute()).GET(call("/expert-bench", "GET"))).status).toBe(404);
    expect((await (await requestRoute()).GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).status).toBe(404);
    expect((await (await operatorAssignments()).GET(call(`/expert-assignments?orgId=${orgId}`, "GET"))).status).toBe(404);
    const { GET: reportGet } = await import("@/app/api/evals/v1/reports/[id]/route");
    expect((await reportGet(call(`/reports/${reportId}?orgId=${orgId}`, "GET"))).status).toBe(404);
    // Even with the assignment's tenant in context, a direct query shows nothing beyond the assignment.
    await asActor(users.expertA, orgId, async (db) => {
      const count = async (table: string) => (await db.query(`SELECT count(*)::int AS n FROM evals.${table}`)).rows[0].n as number;
      expect(await count("review_request")).toBe(0);
      expect(await count("review_crm_draft")).toBe(0);
      expect(await count("review_order")).toBe(0);
      expect(await count("review_order_assignment")).toBe(0);
      expect(await count("expert_onboarding")).toBe(0);
      expect(await count("expert_assignment")).toBe(1);
      expect(await count("expert_assignment_evidence")).toBe(1);
      expect(await count("expert_payment_record")).toBe(0);
    });
    await asActor(users.expertA, "", async (db) => {
      expect((await db.query("SELECT count(*)::int AS n FROM evals.report_revision")).rows[0].n).toBe(0);
      expect((await db.query("SELECT count(*)::int AS n FROM evals.expert_assignment")).rows[0].n).toBe(1);
    });
  });

  it("refuses an expert-review label without recorded reviewers (decision I-7)", async () => {
    as("ops");
    const { PATCH } = await orderRoute();
    const early = await PATCH(call(`/expert-reviews/${requestId}/order`, "PATCH", { action: "publish", orderId }));
    expect(early.status).toBe(409);
    expect((await early.json()).error.code).toBe("EXPERT_REVIEW_UNRECORDED");
    // A forged label written straight into a revision is refused by the database, for any role.
    const current = (await owner.query("SELECT snapshot,run_id FROM evals.report_revision WHERE id=$1", [revisionId])).rows[0];
    const { buildReportSnapshot } = await import("@/lib/evals/reports/contracts");
    const { content_hash: _hash, ...rest } = current.snapshot;
    void _hash;
    const forged = buildReportSnapshot({ ...rest, report_revision_id: randomUUID(), expert_review: { order_id: orderId, reviewer_count: 1, reviewed_on: new Date().toISOString(), scope: "forged" } });
    await expect(owner.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status,created_by) VALUES($1,$2,$3,$4,$5,$6,'preliminary',$7)",
      [forged.report_revision_id, orgId, reportId, current.run_id, forged.content_hash, forged, users.ops])).rejects.toThrow(/EXPERT_REVIEW_UNRECORDED/);
    // The same through the runtime role, as an operator in the tenant's context.
    await asActor(users.ops, orgId, async (db) => {
      await expect(db.query("INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status) VALUES($1,$2,$3,$4,$5,$6,'preliminary')",
        [forged.report_revision_id, orgId, reportId, current.run_id, forged.content_hash, forged])).rejects.toThrow(/EXPERT_REVIEW_UNRECORDED/);
    });
  });

  it("reviews produce a labelled revision with the expert count and scope, notify the customer and track time to review", async () => {
    const { saveExpertSubmission } = await import("@/lib/evals/experts/store");
    const document = { answer: "Q1: agree. Q2: disagree, the rounding rule is applied once.", rationale: "Checked against the excerpts.", source_refs: [], flags: [] };
    await saveExpertSubmission({ userId: users.expertA, profileId: profiles.A }, assignments[0], { expectedVersion: 0, document, submit: true });
    as("ops");
    const { PATCH } = await orderRoute();
    const { GET } = await detailRoute();
    expect((await (await GET(call(`/expert-reviews/${requestId}`, "GET"))).json()).data.progress).toEqual({ reviewer_count: 1, assignment_count: 2 });
    await saveExpertSubmission({ userId: users.expertB, profileId: profiles.B }, assignments[1], { expectedVersion: 0, document, submit: true });
    const published = await PATCH(call(`/expert-reviews/${requestId}/order`, "PATCH", { action: "publish", orderId, note: "Both experts agree with most grades." }));
    expect(published.status).toBe(200);
    const result = (await published.json()).data;
    expect(result.reviewerCount).toBe(2);
    expect(result.label).toMatch(/^Reviewed by 2 experts on \d{1,2} \w+ 20\d\d, scope: the two answers about fees and rounding\.$/);
    expect(result.hoursToReview).toBeGreaterThanOrEqual(0);
    const report = (await owner.query("SELECT current_revision_id FROM evals.report WHERE id=$1", [reportId])).rows[0];
    expect(report.current_revision_id).toBe(result.revisionId);
    const revision = (await owner.query("SELECT snapshot,review_status,supersedes_revision_id FROM evals.report_revision WHERE id=$1", [result.revisionId])).rows[0];
    expect(revision.review_status).toBe("preliminary");
    expect(revision.supersedes_revision_id).toBe(revisionId);
    expect(revision.snapshot.expert_review).toMatchObject({ order_id: orderId, reviewer_count: 2, scope: "the two answers about fees and rounding", note: "Both experts agree with most grades." });
    const { buildExecutiveSummary } = await import("@/lib/evals/reports/summary");
    expect(buildExecutiveSummary(revision.snapshot, "es")!.status.find((item) => item.key === "expert_reviewed")!.text).toMatch(/^Revisado por 2 expertos el /);
    const notice = (await owner.query("SELECT kind,payload FROM evals.notification WHERE org_id=$1 AND event_id=$2", [orgId, `report:${reportId}:${result.revisionId}:published`])).rows[0];
    expect(notice).toMatchObject({ kind: "report_published", payload: { expertReviewers: "2", supersedes: revisionId } });
    const { composeBranded } = await import("@/lib/evals/operations/notifications");
    expect(composeBranded(notice.kind, notice.payload, orgId, "en").subject).toBe("Experts reviewed your Caudals report");
    expect(composeBranded(notice.kind, notice.payload, orgId, "es").text).toContain("2 expertos han revisado tu informe");
    const order = (await owner.query("SELECT status,reviewer_count,result_revision_id,delivered_at IS NOT NULL AS delivered FROM evals.review_order WHERE id=$1", [orderId])).rows[0];
    expect(order).toEqual({ status: "delivered", reviewer_count: 2, result_revision_id: result.revisionId, delivered: true });
    const audit = (await owner.query("SELECT details FROM evals.audit_event WHERE org_id=$1 AND action='review_order.delivered'", [orgId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ reviewer_count: 2 });
    expect(typeof audit[0].details.hours_to_review).toBe("number");
    as("owner");
    expect((await (await (await requestRoute()).GET(call(`/reports/${reportId}/expert-review?orgId=${orgId}`, "GET"))).json()).data.request).toMatchObject({ status: "delivered" });
    // The delivered order is closed.
    as("ops");
    expect((await PATCH(call(`/expert-reviews/${requestId}/order`, "PATCH", { action: "publish", orderId }))).status).toBe(409);
  });

  it("a later request can be declined through the audited path, and the rollback refuses", async () => {
    as("owner");
    const next = (await (await (await requestRoute()).POST(call(`/reports/${reportId}/expert-review`, "POST", { orgId, ...requestBody, scopeKind: "pilot" }))).json()).data;
    expect(next).toMatchObject({ created: true, request: { status: "requested" } });
    expect(mail).toHaveBeenCalledTimes(2);
    as("ops");
    const { PATCH } = await detailRoute();
    expect((await PATCH(call(`/expert-reviews/${next.request.id}`, "PATCH", { action: "quoted" }))).status).toBe(200);
    expect((await PATCH(call(`/expert-reviews/${next.request.id}`, "PATCH", { action: "declined", reason: "Out of scope for this quarter." }))).status).toBe(200);
    expect((await PATCH(call(`/expert-reviews/${next.request.id}`, "PATCH", { action: "quoted" }))).status).toBe(409);
    const row = (await owner.query("SELECT status,replied_at IS NOT NULL AS replied,close_reason FROM evals.review_request WHERE id=$1", [next.request.id])).rows[0];
    expect(row).toEqual({ status: "declined", replied: true, close_reason: "Out of scope for this quarter." });
    const { readFileSync } = await import("node:fs");
    const rollback = readFileSync("db/rollbacks/101_evals_review_orders_down.sql", "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(/Rollback blocked/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.review_order') IS NOT NULL AS kept")).rows[0].kept).toBe(true);
  });
});
