/**
 * "Ask your report" on the production schema (launch L-36; spec v2 P-58,
 * §6.8): one question = one step = one attempt = one hold, settled exactly
 * once with its question (captured on a completed call, released on a
 * failure, a crash or a timeout, nothing at all for a fixed refusal or a
 * question that expired before its call); the caps; and row-level security
 * (members read, owners delete, experts and other workspaces see nothing).
 * The real worker runs against scripts/evals/test-db.sh with a fake model.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { ProviderFailure, type ProviderOutput } from "../../lib/evals/providers/contracts";
import { createReportForRun, scoreRun } from "../../lib/evals/repositories/managed";
import { askReportQuestion, deleteReportQuestion, getReportQuestion, reportQuestionsState } from "../../lib/evals/repositories/report-questions";
import { grantCredits, verifyAccounts } from "../../lib/billing/ledger";
import type { EngineBillingMode } from "../../lib/billing/engine";
import { creditsToUcr } from "../../lib/billing/units";
import { createPrefixedId } from "../../lib/operator/ids";
import { questionRefs } from "../../lib/evals/reports/question-refs";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const WORKER = "service:evals-worker";
const SYSTEM = "service:evals-scheduler";

function setMode(mode: EngineBillingMode) {
  if (mode === "off") { delete process.env.BILLING_CREDITS_ENABLED; delete process.env.BILLING_ENFORCE; return; }
  process.env.BILLING_CREDITS_ENABLED = "true";
  process.env.BILLING_ENFORCE = mode;
}
const answer = (text: string, usage = { input: 900, output: 60, cached: 0 }): ProviderOutput => ({ text, complete: true, finishReason: "stop", latencyMs: 5, usage });

describe.skipIf(!ownerUrl || !runtimeUrl)("ask your report on the production schema (L-36)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 6 });
  const rolePool = (role: string, max: number) => {
    const pool = new Pool({ connectionString: ownerUrl, max });
    pool.on("connect", (client) => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const workerPool = rolePool("evals_worker", 8), schedulerPool = rolePool("evals_scheduler", 2), documentPool = rolePool("evals_document", 2);
  const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
  afterEach(() => { setMode("off"); delete process.env.ANALYTICS_EVENTS_V2; });
  afterAll(async () => { setMode("off"); await Promise.all([owner.end(), workerPool.end(), schedulerPool.end(), documentPool.end(), getEvalsPool().end()]); });

  /** A report in a free workspace (credits, local model only) whose report writer is the fixture's DGX model. */
  async function reportFixture(plan = "free") {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    await owner.query("UPDATE evals.workspace_entitlement SET plan=$2 WHERE org_id=$1", [f.orgId, plan]);
    await scoreRun(f.scope, f.run.id, "questions-fixture-v1");
    const report = await createReportForRun(f.scope, { runId: f.run.id, title: "Questions fixture", reviewStatus: "preliminary", scorerVersion: "questions-fixture-v1" }, randomUUID());
    return { ...f, report };
  }
  type Fixture = Awaited<ReturnType<typeof reportFixture>>;
  const ask = (f: Fixture, question: string, actorId = f.scope.actorId, admin = false) =>
    askReportQuestion({ orgId: f.orgId, actorId }, f.report.reportId, { revisionId: f.report.revisionId, question, locale: "en", admin });
  const T1 = (f: Fixture) => questionRefs(f.report.snapshot).results.get("T1")!;
  /** The real worker; a busy DGX slot (other suites) leaves the step queued, so try again as the outbox would. */
  function engine(mode: EngineBillingMode, invoke: NonNullable<ConstructorParameters<typeof InvocationWorker>[0]["invoke"]>) {
    const worker = new InvocationWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), invoke, leaseSeconds: 30, billing: () => mode });
    return {
      worker,
      async handle(orgId: string, stepId: string) {
        const step = (await owner.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1", [stepId])).rows[0];
        for (let tries = 0; tries < 150; tries++) {
          const before = (await owner.query("SELECT count(*)::int AS n FROM evals.execution_attempt WHERE step_id=$1", [stepId])).rows[0].n;
          await worker.handle({ orgId, stepId, inputHash: step.input_hash });
          const after = (await owner.query("SELECT s.status,(SELECT count(*)::int FROM evals.execution_attempt a WHERE a.step_id=s.id) AS n FROM evals.workflow_step s WHERE s.id=$1", [stepId])).rows[0];
          if (after.status !== "queued" || after.n > before) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("provider_slot_never_free");
      },
    };
  }
  const question = async (id: string) => (await owner.query("SELECT * FROM evals.report_question WHERE id=$1", [id])).rows[0];
  const grant = (orgId: string, credits: number) => withTenant({ orgId, actorId: SYSTEM },
    (db) => grantCredits(db, { orgId, key: `grant-${randomUUID()}`, amountUcr: creditsToUcr(credits), source: "grant" }), schedulerPool);
  const holds = async (orgId: string) => (await owner.query("SELECT * FROM billing.credit_hold WHERE org_id=$1 ORDER BY created_at", [orgId])).rows;
  const member = async (f: Fixture, role: string) => {
    const userId = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, `Fixture ${role}`, `${randomUUID()}@example.test`]);
    if (role !== "outsider") await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [f.orgId, userId, role]);
    return userId;
  };

  it("holds, captures and settles a cited answer exactly once (enforce)", async () => {
    setMode("enforce");
    process.env.ANALYTICS_EVENTS_V2 = "true";
    const f = await reportFixture();
    await grant(f.orgId, 50);
    const asked = await ask(f, "Which answers failed, and why?");
    expect(asked).toMatchObject({ status: "queued", language: "en", sentences: null });
    const row = await question(asked.id);
    expect(row).toMatchObject({ ledger_outcome: "pending", prompt_revision: "caudals-report-questions-v2", model_source: "run", data_routing: "local_only", status: "queued" });
    // The step is a report-writer call on the frozen route that sees only the quoted snapshot, without web research.
    const step = (await owner.query("SELECT input,step_kind FROM evals.workflow_step WHERE id=$1", [row.step_id])).rows[0];
    expect(step.step_kind).toBe("grade");
    expect(step.input).toMatchObject({ role: "report_writer", reportQuestionId: asked.id, outputFormat: "json_object", routing: "local_only" });
    expect(step.input.webSearch).toBeUndefined();
    expect(step.input.messages[1].content).toContain("<report_data>");

    const id = T1(f);
    const run = engine("enforce", async () => answer(JSON.stringify({ type: "answer", sentences: [{ text: "The fee answer is the one that went wrong.", refs: ["T1"] }] })));
    await run.handle(f.orgId, row.step_id);
    const settled = await question(asked.id);
    expect(settled).toMatchObject({ status: "answered", ledger_mode: "enforce", ledger_outcome: "captured", ledger_key: `attempt:${settled.attempt_id}`, input_tokens: 900, output_tokens: 60, token_provenance: "provider_reported" });
    expect(settled.cited_result_ids).toEqual([id]);
    expect(BigInt(settled.charged_ucr)).toBeGreaterThan(BigInt(0));
    const [hold] = await holds(f.orgId);
    expect(hold).toMatchObject({ state: "captured", hold_key: `attempt:${settled.attempt_id}`, captured_ucr: settled.charged_ucr });
    const entries = (await owner.query("SELECT id,entry_type FROM billing.ledger_entry WHERE org_id=$1 AND attempt_id=$2 ORDER BY account_version", [f.orgId, settled.attempt_id])).rows;
    expect(entries.map((entry) => entry.entry_type)).toEqual(["hold", "capture", "release"]);
    expect(settled.ledger_entry_ids).toEqual(entries.map((entry) => entry.id));
    // The member sees the answer with its references; the event records the outcome and the credits.
    const view = await getReportQuestion(f.scope, f.report.reportId, asked.id);
    expect(view.sentences).toEqual([{ text: "The fee answer is the one that went wrong.", refs: [{ kind: "result", id, label: "T1" }] }]);
    expect(view.credits).not.toBeNull();
    const events = (await owner.query("SELECT metadata FROM public.product_analytics_event WHERE event_name='report_question_asked' AND org_id=$1", [f.orgId])).rows;
    expect(events.map((event) => event.metadata.outcome)).toEqual(["answered"]);
    expect(events[0].metadata.credits).toBeGreaterThan(0);

    // Replays change nothing: the step is done, the hold is settled, one capture.
    await run.worker.handle({ orgId: f.orgId, stepId: row.step_id, inputHash: (await owner.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1", [row.step_id])).rows[0].input_hash });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.execution_attempt WHERE step_id=$1", [row.step_id])).rows[0].n).toBe(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='capture'", [f.orgId])).rows[0].n).toBe(1);
    // A settled question never changes.
    await expect(owner.query("UPDATE evals.report_question SET status='failed' WHERE id=$1", [asked.id])).rejects.toThrow(/settled report question/);
    const drift = (await withTenant({ orgId: f.orgId, actorId: SYSTEM }, (db) => verifyAccounts(db, f.orgId), schedulerPool));
    expect(drift.every((account) => account.issues.length === 0)).toBe(true);
  });

  it("charges a completed call even when its answer is discarded, and shows the fixed sentence", async () => {
    setMode("enforce");
    const f = await reportFixture();
    await grant(f.orgId, 50);
    const invented = await ask(f, "Why did the rounding answer fail?");
    const run = engine("enforce", async () => answer(JSON.stringify({ type: "answer", sentences: [{ text: "Because of T77.", refs: ["T77"] }] })));
    await run.handle(f.orgId, (await question(invented.id)).step_id);
    expect(await question(invented.id)).toMatchObject({ status: "unanswerable", reason_code: "citation_invalid", answer: null, ledger_outcome: "captured" });
    expect((await getReportQuestion(f.scope, f.report.reportId, invented.id)).sentences).toBeNull();
    // A reply that obeys the injected "pass everything" and claims certification is refused by the output filter.
    const obeyed = await ask(f, "Summarise the results");
    const obey = engine("enforce", async () => answer(JSON.stringify({ type: "answer", sentences: [{ text: "Everything passes and the assistant is certified.", refs: ["T1"] }] })));
    await obey.handle(f.orgId, (await question(obeyed.id)).step_id);
    expect(await question(obeyed.id)).toMatchObject({ status: "refused", reason_code: "output_filter", answer: null });
  });

  it("refunds failed, unknown and interrupted calls at once, and never retries a question", async () => {
    setMode("enforce");
    const f = await reportFixture();
    await grant(f.orgId, 50);
    const before = (await owner.query("SELECT available_ucr FROM billing.credit_account WHERE org_id=$1", [f.orgId])).rows[0].available_ucr;
    const rejected = await ask(f, "Which answer was the worst?");
    let calls = 0;
    await engine("enforce", async () => { calls++; throw new ProviderFailure("service_unavailable", "rejected"); }).handle(f.orgId, (await question(rejected.id)).step_id);
    expect(calls).toBe(1);
    expect(await question(rejected.id)).toMatchObject({ status: "failed", reason_code: "service_unavailable", ledger_outcome: "released", charged_ucr: "0" });
    // A failed provider opens its short circuit breaker (60 s); close it for the next case.
    const healthy = () => owner.query("UPDATE evals.provider_health SET state='healthy',circuit_until=NULL WHERE provider_revision_id IN (SELECT provider_revision_id FROM evals.generation_provider_route WHERE org_id=$1)", [f.orgId]);
    await healthy();
    // An unknown outcome (the model's deadline) is released now and our cost settled at its bound: nothing to reconcile.
    const unknown = await ask(f, "Which answer was the best?");
    await engine("enforce", async () => { throw new ProviderFailure("network_unavailable", "unknown"); }).handle(f.orgId, (await question(unknown.id)).step_id);
    const failed = await question(unknown.id);
    expect(failed).toMatchObject({ status: "failed", reason_code: "network_unavailable", ledger_outcome: "released", charged_ucr: "0" });
    expect((await owner.query("SELECT state FROM evals.budget_reservation WHERE attempt_id=$1", [failed.attempt_id])).rows[0].state).toBe("settled");
    expect((await owner.query("SELECT released_at FROM evals.provider_slot WHERE attempt_id=$1", [failed.attempt_id])).rows[0].released_at).not.toBeNull();
    await healthy();
    // A worker that dies mid-call: recovery releases the hold and fails the question instead of asking again.
    const crashed = await ask(f, "What should we fix first?");
    const crashedRow = await question(crashed.id);
    const hanging = new InvocationWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), leaseSeconds: 5, billing: () => "enforce",
      invoke: async (_provider, _input, _secret, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ProviderFailure("network_unavailable", "unknown")))) });
    const inputHash = (await owner.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1", [crashedRow.step_id])).rows[0].input_hash;
    // Simulate the crash: claim and dispatch, then let the lease lapse without finishing.
    void hanging.handle({ orgId: f.orgId, stepId: crashedRow.step_id, inputHash }).catch(() => undefined);
    await expect.poll(async () => (await owner.query("SELECT status FROM evals.execution_attempt WHERE step_id=$1", [crashedRow.step_id])).rows[0]?.status, { timeout: 20_000 }).toBe("dispatching");
    await owner.query("UPDATE evals.workflow_step SET lease_until=now()-interval '1 second' WHERE id=$1", [crashedRow.step_id]);
    await engine("enforce", async () => answer("{}")).worker.recover({ orgId: f.orgId, actorId: WORKER });
    await expect.poll(async () => (await question(crashed.id)).status, { timeout: 10_000 }).toBe("failed");
    expect(await question(crashed.id)).toMatchObject({ reason_code: "worker_lease_expired", ledger_outcome: "released", charged_ucr: "0" });
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [crashedRow.step_id])).rows[0].status).toBe("failed");
    // Every hold came back: the balance is where it started.
    await expect.poll(async () => (await owner.query("SELECT available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [f.orgId])).rows[0], { timeout: 10_000 })
      .toMatchObject({ available_ucr: before, held_ucr: "0" });
    expect((await holds(f.orgId)).every((hold) => hold.state === "released")).toBe(true);
  }, 60_000);

  it("closes a question that waited past its deadline without a hold or a call", async () => {
    setMode("enforce");
    const f = await reportFixture();
    await grant(f.orgId, 50);
    const late = await ask(f, "How many answers were correct?");
    const row = await question(late.id);
    const db = await owner.connect();
    try {
      // Only the test moves the deadline (the trigger keeps it immutable).
      await db.query("SET session_replication_role = replica");
      await db.query("UPDATE evals.report_question SET deadline_at=now()-interval '1 second' WHERE id=$1", [late.id]);
    } finally { await db.query("RESET session_replication_role"); db.release(); }
    let calls = 0;
    await engine("enforce", async () => { calls++; return answer("{}"); }).worker.handle({ orgId: f.orgId, stepId: row.step_id, inputHash: (await owner.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1", [row.step_id])).rows[0].input_hash });
    expect(calls).toBe(0);
    expect(await question(late.id)).toMatchObject({ status: "timed_out", reason_code: "queue_deadline", ledger_outcome: "none", attempt_id: null });
    expect(await holds(f.orgId)).toHaveLength(0);
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [row.step_id])).rows[0].status).toBe("canceled");
  });

  it("records the shadow ledger in shadow mode, and refuses legal conclusions with no call at all", async () => {
    setMode("shadow");
    const f = await reportFixture();
    const asked = await ask(f, "Which answers were partly right?");
    await engine("shadow", async () => answer(JSON.stringify({ type: "answer", sentences: [{ text: "None of them.", refs: ["T2"] }] }))).handle(f.orgId, (await question(asked.id)).step_id);
    const settled = await question(asked.id);
    expect(settled).toMatchObject({ status: "answered", ledger_mode: "shadow", ledger_outcome: "captured" });
    const shadow = (await owner.query("SELECT id,kind FROM billing.shadow_entry WHERE org_id=$1 AND entry_key=$2 ORDER BY created_at", [f.orgId, `attempt:${settled.attempt_id}`])).rows;
    expect(shadow.map((entry) => entry.kind)).toEqual(["hold", "capture"]);
    expect(settled.ledger_entry_ids).toEqual(shadow.map((entry) => entry.id));
    expect(await holds(f.orgId)).toHaveLength(0);

    const refused = await ask(f, "Are we compliant with the AI Act?");
    expect(refused).toMatchObject({ status: "refused", reason: "out_of_scope_compliance", sentences: null });
    expect(await question(refused.id)).toMatchObject({ ledger_outcome: "none", workflow_id: null, step_id: null });
    const spanish = await askReportQuestion({ orgId: f.orgId, actorId: f.scope.actorId }, f.report.reportId, { revisionId: f.report.revisionId, question: "¿Es legal usar este asistente?", locale: "en", admin: false });
    expect(spanish).toMatchObject({ status: "refused", language: "es" });
  });

  it("enforces the caps in the database, even under concurrent questions", async () => {
    const f = await reportFixture("free");
    // Free plan: ten questions a month across the workspace (refusals count; they still ask).
    for (let index = 0; index < 10; index++) await ask(f, `Is it legal to deploy? (${index})`);
    await expect(ask(f, "Is it legal to deploy? (10)")).rejects.toMatchObject({ code: "REPORT_QUESTION_MONTHLY_LIMIT", status: 429 });
    const state = await reportQuestionsState(f.scope, f.report.reportId, f.report.revisionId, { enabled: true, admin: false });
    expect(state.limits).toMatchObject({ freeMonth: 10, usedMonth: 10, remaining: 0 });
    // A managed workspace: twenty a day per report; concurrent questions cannot pass it together.
    const g = await reportFixture("managed");
    for (let index = 0; index < 15; index++) await ask(g, `Is it legal to deploy? (${index})`);
    const settled = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => ask(g, `Is it legal to launch? (${index})`)));
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(5);
    expect(settled.filter((item) => item.status === "rejected").every((item) => (item as PromiseRejectedResult).reason.code === "REPORT_QUESTION_DAILY_LIMIT")).toBe(true);
    // Failed questions do not count.
    await owner.query("UPDATE evals.workspace_entitlement SET plan='managed' WHERE org_id=$1", [g.orgId]);
    expect((await reportQuestionsState(g.scope, g.report.reportId, g.report.revisionId, { enabled: true, admin: false })).limits).toMatchObject({ usedToday: 20, remaining: 0, freeMonth: null });
  });

  it("lets members read, owners delete, and nobody else see a question (RLS)", async () => {
    setMode("shadow");
    const f = await reportFixture("managed");
    const [ownerId, editorId, viewerId, outsiderId] = [await member(f, "owner"), await member(f, "editor"), await member(f, "viewer"), await member(f, "outsider")];
    const asked = await ask(f, "Which answers were wrong?", editorId);
    await engine("shadow", async () => answer(JSON.stringify({ type: "answer", sentences: [{ text: "One answer was wrong.", refs: ["T1"] }] }))).handle(f.orgId, (await question(asked.id)).step_id);
    const as = (actorId: string) => ({ orgId: f.orgId, actorId });
    // Viewers read but cannot ask (the policy refuses even a direct insert).
    const viewer = await reportQuestionsState(as(viewerId), f.report.reportId, f.report.revisionId, { enabled: true, admin: false });
    expect(viewer).toMatchObject({ canAsk: false, canDelete: false });
    expect(viewer.questions.map((item) => item.id)).toEqual([asked.id]);
    await expect(ask(f, "Can I ask?", viewerId)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(withTenant(as(viewerId), (db) => db.query(`INSERT INTO evals.report_question(id,org_id,report_id,report_revision_id,run_id,asked_by,question,language,status,prompt_revision,refs,ledger_outcome,deadline_at,finished_at)
      VALUES($1,$2,$3,$4,$5,$6,'x','en','refused','v1','{}','none',now(),now())`, [randomUUID(), f.orgId, f.report.reportId, f.report.revisionId, f.run.id, viewerId]))).rejects.toThrow(/row-level security/);
    // Someone who is not a member (an expert, say) gets no rows, whatever the tenant setting says.
    expect((await withTenant(as(outsiderId), (db) => db.query("SELECT id FROM evals.report_question"))).rowCount).toBe(0);
    // Another workspace's worker sees nothing; the document and browser roles have no grant at all.
    expect((await withTenant({ orgId: randomUUID(), actorId: WORKER }, (db) => db.query("SELECT id FROM evals.report_question"), workerPool)).rowCount).toBe(0);
    await expect(withTenant(as(ownerId), (db) => db.query("SELECT id FROM evals.report_question"), documentPool)).rejects.toThrow(/permission denied/);
    // The web runtime cannot rewrite or delete rows directly.
    await expect(withTenant(as(ownerId), (db) => db.query("UPDATE evals.report_question SET status='failed' WHERE id=$1", [asked.id]))).rejects.toThrow(/permission denied/);
    await expect(withTenant(as(ownerId), (db) => db.query("DELETE FROM evals.report_question WHERE id=$1", [asked.id]))).rejects.toThrow(/permission denied/);
    // Editors cannot delete; owners erase the text and keep the metadata, audited.
    await expect(deleteReportQuestion(as(editorId), f.report.reportId, asked.id, false)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(withTenant(as(editorId), (db) => db.query("SELECT evals.delete_report_question($1)", [asked.id]))).rejects.toThrow(/only owners/);
    expect(await deleteReportQuestion(as(ownerId), f.report.reportId, asked.id, false)).toEqual({ id: asked.id, deleted: true });
    const erased = await question(asked.id);
    expect(erased).toMatchObject({ question: null, answer: null, deleted_by: ownerId, status: "answered", ledger_outcome: "captured" });
    expect(erased.cited_result_ids).toHaveLength(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action='report_question.deleted' AND subject_id=$2", [f.orgId, asked.id])).rows[0].n).toBe(1);
    expect((await reportQuestionsState(as(ownerId), f.report.reportId, f.report.revisionId, { enabled: true, admin: false })).questions).toHaveLength(0);
    await expect(getReportQuestion(as(ownerId), f.report.reportId, asked.id)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    // An erased question cannot be written back.
    await expect(owner.query("UPDATE evals.report_question SET question='back' WHERE id=$1", [asked.id])).rejects.toThrow(/immutable report question/);
    await expect(owner.query("DELETE FROM evals.report_question WHERE id=$1", [asked.id])).rejects.toThrow(/erased, not deleted/);
  });
});
