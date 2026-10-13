/**
 * Credit engine hooks on the production schema (spec v2 §6.8, §6.18; L-11):
 * holds in claim(), captures on success, releases on failure, cancel and
 * recovery, platform meters, admission, the credits_exhausted pause and
 * resume, run refunds, the shadow ledger and its daily diff, and the monthly
 * workspace budget window (G8). Fake providers stand in for the models; every
 * path is the real worker against scripts/evals/test-db.sh.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import { enqueueInvocation, type TenantTransaction } from "../../lib/evals/queue/store";
import { ProviderFailure, type Invocation, type ProviderOutput } from "../../lib/evals/providers/contracts";
import { scoreRun } from "../../lib/evals/repositories/managed";
import { controlRun, createSelfServiceRun } from "../../lib/evals/repositories/stage-c";
import { BudgetExceeded, reserve, settle } from "../../lib/evals/budget/ledger";
import { adjustCredits, CreditsExhausted, expireDue, grantCredits, verifyAccounts } from "../../lib/billing/ledger";
import {
  admissionRequirementUcr, captureEngineCall, chargeMeter, engineChargeUcr, engineHoldUcr, holdEngineCall, shadowFailureCount, type EngineBillingMode,
} from "../../lib/billing/engine";
import { runBillingReconciler, runShadowAdmissions, runShadowReport, shadowDiff } from "../../lib/billing/jobs";
import { setWorkspaceOverride, type EnforcementOverride } from "../../lib/billing/overrides";
import { creditsToUcr } from "../../lib/billing/units";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { CandidateInput } from "../../lib/evals/contracts/projections";
import { createPrefixedId } from "../../lib/operator/ids";
import { encryptSecret } from "../../lib/evals/security/envelope";
import { importedJudgeRunFixture } from "./judge-run-fixture";
import { fixture as minimalFixture, seedAttempt } from "./worker-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const WORKER = "service:evals-worker";
const SYSTEM = "service:evals-scheduler";
const c = (credits: number | string) => creditsToUcr(credits);
const B = (value: number | string | bigint) => BigInt(value);
const LOCAL = { free: false, rates: { inputUcrPerMillion: c(50), outputUcrPerMillion: c(200) } };
// Engine calls use GPT-6 Luna through OpenRouter (15 · 70 credits per 1M in revision 1). Other
// test files draft and activate price-book revisions, so amounts are checked against the
// revision each run froze, never against constants.
const CALL = { input: 300, output: 40, cached: 0 }, SHORT = { input: 300, output: 5, cached: 0 };
const keys = new Map([["v1", randomBytes(32)]]);
type Invoke = NonNullable<ConstructorParameters<typeof InvocationWorker>[0]["invoke"]>;
const answer = (usage: { input: number; output: number; cached: number } | undefined, text = "Looks right.", complete = true): ProviderOutput =>
  ({ text, complete, finishReason: complete ? "stop" : "length", latencyMs: 5, ...(usage ? { usage } : {}) });

function setMode(mode: EngineBillingMode) {
  if (mode === "off") { delete process.env.BILLING_CREDITS_ENABLED; delete process.env.BILLING_ENFORCE; return; }
  process.env.BILLING_CREDITS_ENABLED = "true";
  process.env.BILLING_ENFORCE = mode;
}

describe.skipIf(!ownerUrl || !runtimeUrl)("credit engine hooks on the production schema (L-11)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 6 });
  const rolePool = (role: string, max: number) => {
    const pool = new Pool({ connectionString: ownerUrl, max });
    pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const workerPool = rolePool("evals_worker", 16), schedulerPool = rolePool("evals_scheduler", 4);
  const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
  afterEach(() => setMode("off"));
  afterAll(async () => { setMode("off"); await Promise.all([owner.end(), workerPool.end(), schedulerPool.end(), getEvalsPool().end()]); });

  /* ------------------------------------------------------------ fixtures --- */

  /** A workspace with an imported-answers run and two cases, plus a commercial engine model (GPT-6 Luna, 15 · 70 credits per 1M). */
  async function workspace(plan: "free" | "managed" = "free") {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    if (plan === "free") await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [f.orgId]);
    // Engine calls go to a commercial model with its own slots: the DGX has one residency
    // slot shared with every other test file running in parallel.
    const paid = { providerId: randomUUID(), priceId: randomUUID(), versionId: randomUUID() };
    const accountId = randomUUID(), recordId = randomUUID();
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'billing fixture','EUR',100,true)", [accountId]);
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      VALUES($1,$2,'openai_compatible','https://openrouter.ai/api/v1','openai/gpt-6-luna','fixture',ARRAY['judge'],'{"text":true,"boundedTokens":true,"jsonObject":true}',16384,1024,ARRAY['synthetic'],ARRAY['private'],10000,100000000,16)`, [paid.providerId, accountId]);
    await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0.0000001,0.0000004,0.0000001,0,0,'fixture')", [paid.priceId, paid.providerId]);
    await owner.query("INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,'provider',$3,'fixture')", [recordId, f.orgId, paid.providerId]);
    await owner.query("INSERT INTO evals.secret_version(id,org_id,record_id,envelope,created_by) VALUES($1,$2,$3,$4,'fixture')",
      [paid.versionId, f.orgId, recordId, encryptSecret(Buffer.from("fixture-provider-key"), { orgId: f.orgId, recordId, versionId: paid.versionId, purpose: "provider", scopeId: paid.providerId }, "v1", keys)]);
    const engine = (mode: EngineBillingMode, invoke: Invoke, transaction: TenantTransaction = tx) =>
      driven(new InvocationWorker({ tx: transaction, keys, actorId: WORKER, workerId: randomUUID(), invoke, leaseSeconds: 30, billing: () => mode }));
    return { ...f, paid, engine };
  }
  type Workspace = Awaited<ReturnType<typeof workspace>>;
  /**
   * A claim that finds the provider's slots busy leaves the step queued with
   * no new attempt; try again, as the outbox would.
   */
  function driven(worker: InvocationWorker) {
    return {
      recover: (tenant: { orgId: string; actorId: string }) => worker.recover(tenant),
      async handle(item: { orgId: string; stepId: string; inputHash: string }) {
        for (let tries = 0; tries < 150; tries++) {
          const before = (await owner.query("SELECT count(*)::int AS n FROM evals.execution_attempt WHERE step_id=$1", [item.stepId])).rows[0].n;
          await worker.handle(item);
          const after = (await owner.query("SELECT s.status,(SELECT count(*)::int FROM evals.execution_attempt a WHERE a.step_id=s.id) AS n FROM evals.workflow_step s WHERE s.id=$1", [item.stepId])).rows[0];
          if (after.status !== "queued" || after.n > before) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("provider_slot_never_free");
      },
    };
  }
  const grant = (orgId: string, credits: number | string) => withTenant({ orgId, actorId: SYSTEM },
    db => grantCredits(db, { orgId, key: `grant-${randomUUID()}`, amountUcr: c(credits), source: "grant" }), schedulerPool);
  const balances = async (orgId: string) => {
    const row = (await owner.query("SELECT available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
    return { available: B(row.available_ucr), held: B(row.held_ucr) };
  };
  const entries = async (orgId: string, type?: string) => (await owner.query(`SELECT entry_type,amount_ucr,idempotency_key,run_id,attempt_id,case_unit_id,meter,
      price_book_revision_id,available_after_ucr,metadata FROM billing.ledger_entry WHERE org_id=$1 AND ($2::text IS NULL OR entry_type=$2) ORDER BY account_version`,
    [orgId, type ?? null])).rows;
  const shadow = async (orgId: string, kind?: string) => (await owner.query(`SELECT * FROM billing.shadow_entry WHERE org_id=$1 AND ($2::text IS NULL OR kind=$2)
    ORDER BY created_at,id`, [orgId, kind ?? null])).rows;
  const issues = async (orgId: string) => (await withTenant({ orgId, actorId: SYSTEM }, db => verifyAccounts(db, orgId), schedulerPool))[0].issues;
  const job = (orgId: string, step: { id: string; input_hash: string }) => ({ orgId, stepId: step.id, inputHash: step.input_hash });
  const healthy = (f: Workspace) => owner.query("DELETE FROM evals.provider_health WHERE provider_revision_id=$1", [f.paid.providerId]);
  const attempts = async (orgId: string) => (await owner.query(`SELECT a.id,a.status,a.token_bound,a.provider_revision_id,s.input,w.run_id AS workflow_run_id
    FROM evals.execution_attempt a JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id) WHERE a.org_id=$1 ORDER BY a.created_at,a.id`, [orgId])).rows;
  /** The model rates a revision gives GPT-6 Luna (or the DGX) for a call of this many input tokens. */
  const rates = async (revisionId: string, inputTokens: number, provider = "openrouter", model = "openai/gpt-6-luna") => {
    const row = (await owner.query("SELECT input_ucr_per_m,output_ucr_per_m,cached_ucr_per_m FROM billing.rate_for($1,$2,$3,$4)", [revisionId, provider, model, inputTokens])).rows[0];
    return { free: false, rates: { inputUcrPerMillion: B(row.input_ucr_per_m), outputUcrPerMillion: B(row.output_ucr_per_m), ...(row.cached_ucr_per_m ? { cachedUcrPerMillion: B(row.cached_ucr_per_m) } : {}) } };
  };
  const charge = async (revisionId: string, usage: { input: number; output: number; cached: number }) => engineChargeUcr(await rates(revisionId, usage.input), usage);
  const meterRate = async (revisionId: string, meter: string) =>
    B((await owner.query("SELECT ucr_per_unit FROM billing.action_rate WHERE revision_id=$1 AND meter=$2", [revisionId, meter])).rows[0].ucr_per_unit);
  const runRevision = async (runId: string) => (await owner.query("SELECT price_book_revision_id FROM evals.run WHERE id=$1", [runId])).rows[0].price_book_revision_id as string;

  /** Judge-role engine steps on one workflow (a run's own id resolves the run; any other id is a job of its own). */
  async function engineSteps(f: Workspace, count: number, workflowRunId: string = randomUUID(), maxOutputTokens = 256) {
    const workspaceBudget = (await owner.query("SELECT id FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace'", [f.orgId])).rows[0].id;
    const runBudget = (await owner.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,'EUR',10) RETURNING id",
      [f.orgId, workflowRunId])).rows[0].id;
    const workflowId = randomUUID(), tenant = { orgId: f.orgId, actorId: f.actorId };
    const jobs = [];
    for (let index = 0; index < count; index++) {
      const input: Invocation = { probe: false, probeKind: "text", outputFormat: "text", providerRevisionId: f.paid.providerId, priceRevisionId: f.paid.priceId,
        secretVersionId: f.paid.versionId, workspaceBudgetId: workspaceBudget, runBudgetId: runBudget, role: "judge", dataClass: "synthetic", region: "private",
        routing: "approved_providers", approvedProviderIds: [f.paid.providerId], messages: [{ role: "user", content: `Grade answer ${index} of ${workflowId}.` }], maxOutputTokens, timeoutMs: 60000,
        internalCostPerSecond: "0" };
      const stepId = await withTenant(tenant, db => enqueueInvocation(db, tenant, { workflowId, runId: workflowRunId, planHash: "b".repeat(64), kind: "grade", version: 1, input }));
      const step = (await owner.query("SELECT id,input_hash FROM evals.workflow_step WHERE id=$1", [stepId])).rows[0];
      jobs.push(job(f.orgId, step));
    }
    return { workflowId, jobs };
  }

  /** Every hold ends captured, released or expired, settles once, and its parts add up. */
  async function settledExactlyOnce(orgId: string) {
    const holds = (await owner.query("SELECT id,hold_key,amount_ucr,captured_ucr,released_ucr,state FROM billing.credit_hold WHERE org_id=$1", [orgId])).rows;
    for (const hold of holds) {
      expect(["captured", "released", "expired"]).toContain(hold.state);
      expect(B(hold.captured_ucr) + B(hold.released_ucr)).toBe(B(hold.amount_ucr));
      const counts = Object.fromEntries((await owner.query("SELECT entry_type,count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND hold_id=$2 GROUP BY entry_type",
        [orgId, hold.id])).rows.map(row => [row.entry_type, row.n]));
      expect(counts.hold).toBe(1);
      expect(counts.capture ?? 0).toBe(hold.state === "captured" ? 1 : 0);
      expect(counts.release ?? 0).toBeLessThanOrEqual(1);
    }
    return holds;
  }

  /* --------------------------------------------------------------- tests --- */

  it("freezes the price book into runs and generation jobs, immutably", async () => {
    const f = await workspace();
    const current = (await owner.query("SELECT (billing.price_book_at(now())).id AS id")).rows[0].id;
    expect((await owner.query("SELECT price_book_revision_id FROM evals.run WHERE id=$1", [f.run.id])).rows[0].price_book_revision_id).toBe(current);
    await expect(owner.query("UPDATE evals.run SET price_book_revision_id=NULL WHERE id=$1", [f.run.id])).rejects.toThrow("immutable job price book");
    // Status changes do not touch the snapshot.
    await owner.query("UPDATE evals.run SET updated_at=now() WHERE id=$1", [f.run.id]);
  });

  it("holds at claim, captures rate × usage plus meters exactly, and graded answers once (enforce)", async () => {
    setMode("enforce");
    const f = await workspace();
    await grant(f.orgId, 100);
    const scored = await scoreRun(f.scope, f.run.id, "judge-fixture-v1");
    expect(scored.judgments).toMatchObject({ queued: 2 });
    const usages = [CALL, SHORT];
    let call = 0;
    const worker = f.engine("enforce", async () => answer(usages[call++]));
    for (const item of (await engineSteps(f, 2, f.run.id)).jobs) await worker.handle(item);
    expect(call).toBe(2);

    const revision = await runRevision(f.run.id);
    const graded = await meterRate(revision, "graded_answer"), callUcr = await charge(revision, CALL), shortUcr = await charge(revision, SHORT);
    const actions = await entries(f.orgId, "action");
    expect(actions.map(row => [row.meter, B(row.amount_ucr), row.run_id, row.price_book_revision_id])).toEqual([
      ["graded_answer", -graded, f.run.id, revision], ["graded_answer", -graded, f.run.id, revision]]);
    expect(new Set(actions.map(row => row.idempotency_key)).size).toBe(2);
    expect(actions.every(row => row.idempotency_key === `action:unit:${row.case_unit_id}`)).toBe(true);
    const captures = await entries(f.orgId, "capture");
    expect(captures.map(row => B(row.amount_ucr))).toEqual([-callUcr, -shortUcr]);
    expect(captures.every(row => row.run_id === f.run.id && row.price_book_revision_id === revision)).toBe(true);
    for (const attempt of await attempts(f.orgId)) {
      const hold = (await owner.query("SELECT amount_ucr,run_id,price_book_revision_id FROM billing.credit_hold WHERE org_id=$1 AND attempt_id=$2", [f.orgId, attempt.id])).rows[0];
      const bound = { input: attempt.token_bound - attempt.input.maxOutputTokens, output: attempt.input.maxOutputTokens };
      expect(hold.price_book_revision_id).toBe(revision);
      expect(B(hold.amount_ucr)).toBe(engineHoldUcr(await rates(revision, bound.input), bound));
      expect(hold.run_id).toBe(f.run.id);
    }
    expect(await balances(f.orgId)).toEqual({ available: c(100) - graded * BigInt(2) - callUcr - shortUcr, held: B(0) });
    await settledExactlyOnce(f.orgId);
    expect(await issues(f.orgId)).toEqual([]);
    // Re-scoring and replaying a settled call never charge again.
    const before = (await entries(f.orgId)).length;
    expect((await scoreRun(f.scope, f.run.id, "judge-fixture-v1")).created).toBe(0);
    const [first] = await attempts(f.orgId);
    await tx({ orgId: f.orgId, actorId: WORKER }, db => captureEngineCall(db, "enforce", { orgId: f.orgId, attemptId: first.id, providerRevisionId: first.provider_revision_id,
      workflowRunId: first.workflow_run_id }, { ...CALL, provenance: "provider_reported" }));
    expect((await entries(f.orgId)).length).toBe(before);
  });

  it("charges 0 for failed, timed-out, unknown, incomplete, cancelled and undispatched calls (enforce)", async () => {
    setMode("enforce");
    const f = await workspace();
    await grant(f.orgId, 50);
    // One workflow per case: a paused or failed step pauses or ends its own workflow.
    const jobs = [
      (await engineSteps(f, 1)).jobs[0], (await engineSteps(f, 1)).jobs[0], (await engineSteps(f, 1, f.run.id)).jobs[0],
      (await engineSteps(f, 1)).jobs[0], (await engineSteps(f, 1)).jobs[0],
    ];
    // A rejected call: released, never captured.
    await f.engine("enforce", async () => { throw new ProviderFailure("invalid_credentials", "rejected"); }).handle(jobs[0]);
    await healthy(f);
    // An incomplete answer: the work did not complete, the hold comes back.
    await f.engine("enforce", async () => answer({ input: 300, output: 256, cached: 0 }, "truncated", false)).handle(jobs[1]);
    // A timeout with an unknown outcome keeps its hold; the engine asks again and only that answer is charged.
    await f.engine("enforce", async () => { throw new ProviderFailure("network_unavailable", "unknown"); }).handle(jobs[2]);
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [jobs[2].stepId])).rows[0].status).toBe("queued");
    await healthy(f);
    await owner.query("UPDATE evals.workflow_step SET not_before=now() WHERE id=$1", [jobs[2].stepId]);
    await f.engine("enforce", async () => answer(CALL)).handle(jobs[2]);
    // Cancelled between the claim and the dispatch.
    let calls = 0;
    const cancelling: TenantTransaction = async (tenant, fn) => {
      const result = await tx(tenant, fn);
      if (++calls === 1) await owner.query("UPDATE evals.execution_workflow SET status='cancel_requested' WHERE org_id=$1 AND id=(SELECT workflow_id FROM evals.workflow_step WHERE id=$2)", [f.orgId, jobs[3].stepId]);
      return result;
    };
    const invoked = vi.fn(async () => answer({ input: 1, output: 1, cached: 0 }));
    await f.engine("enforce", invoked, cancelling).handle(jobs[3]);
    expect(invoked).not.toHaveBeenCalled();
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [jobs[3].stepId])).rows[0].status).toBe("canceled");
    // The worker dies after its claim, before dispatch; recovery releases the hold.
    let dead = false;
    const dying: TenantTransaction = async (tenant, fn) => {
      if (dead) throw new Error("worker_killed");
      const result = await tx(tenant, fn);
      if (result && typeof result === "object" && "attemptId" in result) dead = true;
      return result;
    };
    await expect(f.engine("enforce", invoked, dying).handle(jobs[4])).rejects.toThrow("worker_killed");
    await owner.query("UPDATE evals.workflow_step SET lease_until=now()-interval '1 second' WHERE id=$1", [jobs[4].stepId]);
    await f.engine("enforce", invoked).recover({ orgId: f.orgId, actorId: WORKER });
    expect(invoked).not.toHaveBeenCalled();

    // The unknown call's hold waits out its 24 hours, then expiry returns it.
    expect((await owner.query("SELECT count(*)::int AS n FROM billing.credit_hold WHERE org_id=$1 AND state='held'", [f.orgId])).rows[0].n).toBe(1);
    await owner.query("UPDATE billing.credit_hold SET expires_at=now()-interval '1 second' WHERE org_id=$1 AND state='held'", [f.orgId]);
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => expireDue(db, { orgId: f.orgId }), schedulerPool);

    const holds = await settledExactlyOnce(f.orgId);
    expect(holds.map(hold => hold.state).sort()).toEqual(["captured", "expired", "released", "released", "released", "released"]);
    const captures = await entries(f.orgId, "capture");
    const call = await charge(await runRevision(f.run.id), CALL);
    expect(captures.map(row => B(row.amount_ucr))).toEqual([-call]);
    expect(await entries(f.orgId, "action")).toEqual([]);
    expect(await balances(f.orgId)).toEqual({ available: c(50) - call, held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("never lets concurrent runs push available credits below zero (enforce)", async () => {
    setMode("enforce");
    // Hook level: 24 calls of two runs hold at once, then capture; holds commit before captures, as in the worker.
    const g = await workspace();
    await grant(g.orgId, 1);
    const other = randomUUID(), bound = { input: 2_000, output: 500 }; // 0.2 credits held per call
    expect(engineHoldUcr(LOCAL, bound)).toBe(c("0.2"));
    const outcomes = await Promise.all(Array.from({ length: 24 }, async (_, index) => {
      const ref = { orgId: g.orgId, attemptId: randomUUID(), providerRevisionId: g.providerId, workflowRunId: index % 2 ? g.run.id : other };
      try { await tx({ orgId: g.orgId, actorId: WORKER }, db => holdEngineCall(db, "enforce", ref, bound)); } catch (error) {
        expect(error).toBeInstanceOf(CreditsExhausted);
        return "refused";
      }
      await new Promise(resolve => setTimeout(resolve, 30));
      await tx({ orgId: g.orgId, actorId: WORKER }, db => captureEngineCall(db, "enforce", ref, { input: 300, output: 40, cached: 0, provenance: "provider_reported" }));
      return "captured";
    }));
    expect(outcomes.filter(item => item === "captured").length).toBeGreaterThanOrEqual(5);
    expect(outcomes.filter(item => item === "refused").length).toBeGreaterThan(0);
    const hooks = await balances(g.orgId);
    const hookCaptures = await entries(g.orgId, "capture");
    expect(hookCaptures).toHaveLength(outcomes.filter(item => item === "captured").length);
    expect(hooks).toEqual({ available: c(1) + hookCaptures.reduce((sum, row) => sum + B(row.amount_ucr), B(0)), held: B(0) });
    expect((await entries(g.orgId)).every(row => B(row.available_after_ucr) >= B(0))).toBe(true);
    await settledExactlyOnce(g.orgId);
    expect(await issues(g.orgId)).toEqual([]);

    // Worker level: two workflows' steps claimed by three workers in rounds until credits run out.
    const f = await workspace();
    // About 0.034 credits are held per call: 0.1 credits cover two calls in flight, not twelve.
    await grant(f.orgId, "0.1");
    const a = await engineSteps(f, 6, f.run.id), b = await engineSteps(f, 6);
    const invoke: Invoke = async () => { await new Promise(resolve => setTimeout(resolve, 250)); return answer(CALL); };
    const workers = [f.engine("enforce", invoke), f.engine("enforce", invoke), f.engine("enforce", invoke)];
    const workflows = [a.workflowId, b.workflowId];
    for (let round = 0; round < 40; round++) {
      // Steps a busy or paused workflow put back in the queue are delivered again, as the outbox would.
      const queued = (await owner.query("SELECT id,input_hash FROM evals.workflow_step WHERE workflow_id=ANY($1::uuid[]) AND status='queued'", [workflows])).rows;
      if (!queued.length) break;
      await owner.query("UPDATE evals.workflow_step SET not_before=now() WHERE id=ANY($1::uuid[])", [queued.map(row => row.id)]);
      await Promise.all(queued.map((row, index) => workers[index % workers.length].handle(job(f.orgId, row))));
    }
    const after = await balances(f.orgId);
    expect(after.available >= B(0)).toBe(true);
    expect(after.held).toBe(B(0));
    expect((await entries(f.orgId)).every(row => B(row.available_after_ucr) >= B(0))).toBe(true);
    const captured = (await entries(f.orgId, "capture")).reduce((sum, row) => sum - B(row.amount_ucr), B(0));
    expect(captured + after.available).toBe(c("0.1"));
    const steps = (await owner.query("SELECT status,reason_code FROM evals.workflow_step WHERE workflow_id=ANY($1::uuid[])", [workflows])).rows;
    expect(steps.filter(step => step.status === "completed").length).toBeGreaterThan(0);
    expect(steps.filter(step => step.status === "paused").length).toBeGreaterThan(0);
    expect(steps.some(step => step.reason_code === "credits_exhausted")).toBe(true);
    expect((await owner.query("SELECT 1 FROM evals.execution_workflow WHERE id=ANY($1::uuid[]) AND reason_code='credits_exhausted'", [workflows])).rowCount).toBeGreaterThan(0);
    await settledExactlyOnce(f.orgId);
    expect(await issues(f.orgId)).toEqual([]);
  }, 60_000);

  it("records the same maths in shadow mode without touching balances or blocking anything", async () => {
    setMode("shadow");
    const f = await workspace();
    // Zero credits: enforce mode would refuse every hold and meter.
    const scored = await scoreRun(f.scope, f.run.id, "judge-fixture-v1");
    expect(scored.judgments).toMatchObject({ queued: 2 });
    const usages = [CALL, SHORT];
    let call = 0;
    const worker = f.engine("shadow", async () => answer(usages[call++]));
    const { jobs } = await engineSteps(f, 2, f.run.id);
    for (const item of jobs) await worker.handle(item);
    const statuses = (await owner.query("SELECT status FROM evals.workflow_step WHERE id=ANY($1::uuid[])", [jobs.map(item => item.stepId)])).rows;
    expect(statuses.map(row => row.status)).toEqual(["completed", "completed"]);
    expect(await entries(f.orgId)).toEqual([]);
    expect(await balances(f.orgId)).toEqual({ available: B(0), held: B(0) });
    const holds = await shadow(f.orgId, "hold"), captures = await shadow(f.orgId, "capture"), actions = await shadow(f.orgId, "action");
    expect(holds).toHaveLength(2);
    expect(holds.every(row => row.would_block && row.billing_mode === "free" && row.run_id === f.run.id)).toBe(true);
    const revision = await runRevision(f.run.id), graded = await meterRate(revision, "graded_answer");
    const callUcr = await charge(revision, CALL), shortUcr = await charge(revision, SHORT);
    expect(captures.map(row => B(row.amount_ucr))).toEqual([callUcr, shortUcr]);
    expect(captures.map(row => B(row.amount_ucr) + B(row.released_ucr))).toEqual(holds.map(row => B(row.amount_ucr)));
    expect(actions.map(row => [row.meter, B(row.amount_ucr), row.would_block])).toEqual([["graded_answer", graded, true], ["graded_answer", graded, true]]);

    // The same inputs through enforce mode give the same amounts (replayed, then rolled back).
    await grant(f.orgId, 100);
    class Rollback extends Error {}
    await withTenant({ orgId: f.orgId, actorId: WORKER }, async (db: PoolClient) => {
      for (const attempt of await attempts(f.orgId)) {
        const ref = { orgId: f.orgId, attemptId: attempt.id, providerRevisionId: attempt.provider_revision_id, workflowRunId: attempt.workflow_run_id };
        await holdEngineCall(db, "enforce", ref, { input: attempt.token_bound - attempt.input.maxOutputTokens, output: attempt.input.maxOutputTokens });
        const shadowHold = holds.find(row => row.attempt_id === attempt.id)!;
        expect(B((await db.query("SELECT amount_ucr FROM billing.credit_hold WHERE org_id=$1 AND attempt_id=$2", [f.orgId, attempt.id])).rows[0].amount_ucr)).toBe(B(shadowHold.amount_ucr));
        const shadowCapture = captures.find(row => row.attempt_id === attempt.id)!;
        await captureEngineCall(db, "enforce", ref, shadowCapture.usage);
        const captured = (await db.query("SELECT amount_ucr FROM billing.ledger_entry WHERE org_id=$1 AND attempt_id=$2 AND entry_type='capture'", [f.orgId, attempt.id])).rows[0];
        expect(-B(captured.amount_ucr)).toBe(B(shadowCapture.amount_ucr));
        expect(B(shadowCapture.requested_ucr)).toBe(await charge(revision, shadowCapture.usage));
      }
      for (const action of actions) {
        await chargeMeter(db, "enforce", { orgId: f.orgId, key: action.entry_key, meter: action.meter, quantity: Number(action.quantity), runId: action.run_id, caseUnitId: action.case_unit_id });
        const charged = (await db.query("SELECT amount_ucr FROM billing.ledger_entry WHERE org_id=$1 AND idempotency_key=$2", [f.orgId, `action:${action.entry_key}`])).rows[0];
        expect(-B(charged.amount_ucr)).toBe(B(action.amount_ucr));
      }
      throw new Rollback();
    }, workerPool).catch(error => { if (!(error instanceof Rollback)) throw error; });
    expect(await entries(f.orgId, "capture")).toEqual([]);

    // The daily diff for this workspace agrees with what happened.
    const today = new Date().toISOString().slice(0, 10);
    const diff = await withTenant({ orgId: "", actorId: SYSTEM }, async db => (await db.query("SELECT billing.shadow_diff($1::date,$2::uuid) AS d", [today, f.orgId])).rows[0].d, schedulerPool);
    expect(diff.mismatches).toBe(0);
    expect(diff.totals).toMatchObject({ holds: 2, captures: 2, actions: 2, holds_blocked: 2, actions_blocked: 2, charged_ucr: Number(graded * BigInt(2) + callUcr + shortUcr) });
    expect(diff.euro).toMatchObject({ attempts: 2, missing: 0 });
  });

  it("cannot fail, pause or slow a run in shadow mode, even when shadow writes fail or the account is locked", async () => {
    setMode("shadow");
    const f = await workspace();
    const before = shadowFailureCount();
    const { jobs } = await engineSteps(f, 2);
    // Shadow writes fail: the run carries on.
    await owner.query("REVOKE EXECUTE ON FUNCTION billing.shadow_hold(uuid,text,bigint,uuid,uuid,uuid,uuid,uuid,jsonb) FROM evals_worker");
    try {
      await f.engine("shadow", async () => answer(CALL)).handle(jobs[0]);
    } finally {
      await owner.query("GRANT EXECUTE ON FUNCTION billing.shadow_hold(uuid,text,bigint,uuid,uuid,uuid,uuid,uuid,jsonb) TO evals_worker");
    }
    expect(shadowFailureCount()).toBeGreaterThan(before);
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [jobs[0].stepId])).rows[0].status).toBe("completed");
    // Another transaction holds the credit account: shadow mode never waits for it.
    const lock = await owner.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT 1 FROM billing.credit_account WHERE org_id=$1 FOR UPDATE", [f.orgId]);
      const started = Date.now();
      await f.engine("shadow", async () => answer(CALL)).handle(jobs[1]);
      expect(Date.now() - started).toBeLessThan(5000);
    } finally { await lock.query("ROLLBACK"); lock.release(); }
    expect((await owner.query("SELECT status FROM evals.workflow_step WHERE id=$1", [jobs[1].stepId])).rows[0].status).toBe("completed");
    expect(await shadow(f.orgId, "capture")).toHaveLength(1);
    expect(await entries(f.orgId)).toEqual([]);
  });

  it("refunds a failed run once and releases unknown shadow holds after 24 hours", async () => {
    setMode("enforce");
    const enforced = await workspace();
    await grant(enforced.orgId, 10);
    const { jobs } = await engineSteps(enforced, 2, enforced.run.id);
    for (const item of jobs) await enforced.engine("enforce", async () => answer(CALL)).handle(item);
    await owner.query("UPDATE evals.run SET status='failed' WHERE id=$1", [enforced.run.id]);
    const first = await runBillingReconciler(SYSTEM, "enforce");
    expect(first.refunds).toBeGreaterThanOrEqual(1);
    const refunds = await entries(enforced.orgId, "refund");
    const call = await charge(await runRevision(enforced.run.id), CALL);
    expect(refunds.map(row => B(row.amount_ucr))).toEqual([call, call]);
    expect(refunds.every(row => row.idempotency_key.startsWith(`run-refund:${enforced.run.id}:`))).toBe(true);
    await runBillingReconciler(SYSTEM, "enforce");
    expect(await entries(enforced.orgId, "refund")).toHaveLength(2);
    expect(await balances(enforced.orgId)).toEqual({ available: c(10), held: B(0) });
    expect(await issues(enforced.orgId)).toEqual([]);

    setMode("shadow");
    const shadowed = await workspace();
    const steps = await engineSteps(shadowed, 2, shadowed.run.id);
    await shadowed.engine("shadow", async () => answer(CALL)).handle(steps.jobs[0]);
    await shadowed.engine("shadow", async () => { throw new ProviderFailure("network_unavailable", "unknown"); }).handle(steps.jobs[1]);
    await owner.query("UPDATE evals.run SET status='failed' WHERE id=$1", [shadowed.run.id]);
    // A hold recorded 25 hours ago that never settled (an unknown outcome).
    const stale = `attempt:${randomUUID()}`;
    await owner.query(`INSERT INTO billing.shadow_entry(org_id,kind,entry_key,billing_mode,amount_ucr,actor_id,created_at)
      VALUES($1,'hold',$2,'free',1000,'fixture',now()-interval '25 hours')`, [shadowed.orgId, stale]);
    const reconciled = await runBillingReconciler(SYSTEM, "shadow");
    expect(reconciled.shadowExpired).toBeGreaterThanOrEqual(1);
    expect((await shadow(shadowed.orgId, "release")).find(row => row.entry_key === stale)).toMatchObject({ reason: "hold_expired", amount_ucr: "1000" });
    // The fresh unknown hold still waits for its 24 hours.
    expect((await shadow(shadowed.orgId, "release")).filter(row => row.reason === "hold_expired")).toHaveLength(1);
    expect((await shadow(shadowed.orgId, "refund")).map(row => [row.entry_key, B(row.amount_ucr)])).toEqual([[`run-refund:${shadowed.run.id}`, await charge(await runRevision(shadowed.run.id), CALL)]]);
    await runBillingReconciler(SYSTEM, "shadow");
    expect(await shadow(shadowed.orgId, "refund")).toHaveLength(1);
    expect(await entries(shadowed.orgId)).toEqual([]);
    const report = await runShadowReport(SYSTEM, new Date().toISOString().slice(0, 10));
    expect(report.report).toHaveProperty("checks");
    const diff = await shadowDiff(SYSTEM, new Date().toISOString().slice(0, 10), shadowed.orgId) as { mismatches: number; totals: Record<string, number> };
    expect(diff.mismatches).toBe(0);
    expect(diff.totals).toMatchObject({ refunds: 1, releases_expired: 1 });
  });

  it("meters a finalized source once, at the price book in effect, without a run", async () => {
    const f = await workspace();
    await grant(f.orgId, 10);
    const key = `source:${randomUUID()}`, shadowKey = `source:${randomUUID()}`;
    const charge = (mode: EngineBillingMode, entryKey: string) => tx({ orgId: f.orgId, actorId: "service:evals-documents" },
      db => chargeMeter(db, mode, { orgId: f.orgId, key: entryKey, meter: "document_page", quantity: 7 }));
    expect(await charge("enforce", key)).toEqual({ shortfallUcr: B(0) });
    await charge("enforce", key);
    const charged = await entries(f.orgId, "action");
    const page = await meterRate(charged[0].price_book_revision_id, "document_page");
    expect(charged.map(row => [row.idempotency_key, B(row.amount_ucr), row.run_id, row.metadata.quantity])).toEqual([[`action:${key}`, -page * BigInt(7), null, 7]]);
    expect(charged[0].price_book_revision_id).toBe((await owner.query("SELECT (billing.price_book_at(now())).id AS id")).rows[0].id);
    await charge("shadow", shadowKey);
    await charge("shadow", shadowKey);
    expect((await shadow(f.orgId, "action")).map(row => [row.entry_key, B(row.amount_ucr), row.meter])).toEqual([[shadowKey, page * BigInt(7), "document_page"]]);
    expect(await charge("off", `source:${randomUUID()}`)).toEqual({ shortfallUcr: B(0) });
    expect(await entries(f.orgId, "action")).toHaveLength(1);
    expect(await issues(f.orgId)).toEqual([]);
  });

  /* ------------------------------------------- target meters and admission --- */

  async function apiEvaluation(repetitions: number) {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID();
    const evaluationId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID();
    const pack = syntheticAccountingFixture(actorId), scope = { orgId, actorId };
    const item = withContentHash({ ...Object.fromEntries(Object.entries(pack.cases[0]).filter(([key]) => key !== "content_hash")), limits: { ...pack.cases[0].limits, repetitions } }) as typeof pack.cases[0];
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible", endpoint: "https://example.test/v1", model: "fixture", credential: { kind: "none" }, limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 1000, concurrent_sessions: 100, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Billing fixture\',$2,true)', [actorId, `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Billing fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Billing fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
      await db.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report) VALUES($1,$2,'ready',$3)", [orgId, revisionId, { features: [{ capability: "text", status: "supported" }] }]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [pack.rubric.revision_id, orgId, projectId, pack.rubric.content_hash, pack.rubric]);
      await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
      await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, pack.rubric.revision_id]);
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Own tests')", [suiteId, orgId, projectId]);
      const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [], case_revisions: [{ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split }], source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgId, suiteVersionId, item.revision_id]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_suite_version_id,selected_target_revision_id) VALUES($1,$2,$3,'Billed evaluation','source_grounded',10,'EUR','ready',$4,$5)", [evaluationId, orgId, projectId, suiteVersionId, revisionId]);
      await db.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [orgId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const steps = async (runId: string) => (await owner.query(`SELECT s.id,s.input_hash,s.input->>'caseUnitId' AS unit FROM evals.workflow_step s
      JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id) WHERE w.run_id=$1 ORDER BY s.created_at,s.id`, [runId])).rows;
    return { scope, orgId, evaluationId, suiteVersionId, revisionId, steps };
  }
  const observation = (input: CandidateInput, context: { run_id: string; attempt_id: string; target_revision_id: string }) => {
    const unknown = { value: null, provenance: "unavailable" as const };
    return withContentHash({ schema_version: "1.0" as const, observation_id: randomUUID(), run_id: context.run_id, case_revision_id: input.case_revision_id, repetition: 0, attempt_id: context.attempt_id, target_revision_id: context.target_revision_id, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), messages: [...input.messages, { role: "assistant" as const, content: "EUR 135.80" }], tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded" as const, error: null, metadata: { latency_ms: { value: 1, provenance: "measured" as const }, input_tokens: unknown, output_tokens: unknown, cost: unknown, model_identity: unknown }, extensions: {} });
  };

  it("admits runs on their p90, meters answered questions, pauses when credits run out and resumes (enforce)", async () => {
    setMode("enforce");
    const f = await apiEvaluation(3);
    await expect(createSelfServiceRun(f.scope, { evaluationId: f.evaluationId }, randomUUID())).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED", status: 402 });
    const required = await withTenant(f.scope, db => admissionRequirementUcr(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: f.revisionId }));
    const api = await meterRate(required.priceBookRevisionId!, "api_question");
    expect(required.requiredUcr >= api * BigInt(3)).toBe(true); // three API questions, at least
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => grantCredits(db, { orgId: f.orgId, key: `grant-${randomUUID()}`, amountUcr: required.requiredUcr + c(5), source: "grant" }), schedulerPool);
    const run = await createSelfServiceRun(f.scope, { evaluationId: f.evaluationId }, randomUUID());
    expect((await owner.query("SELECT price_book_revision_id IS NOT NULL AS frozen FROM evals.run WHERE id=$1", [run.id])).rows[0].frozen).toBe(true);
    // Leave exactly one question's worth, at the run's frozen rate.
    const runApi = await meterRate(await runRevision(run.id), "api_question");
    const left = (await balances(f.orgId)).available - runApi;
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => adjustCredits(db, { orgId: f.orgId, key: `adjust-${randomUUID()}`, amountUcr: -left, reason: "Fixture: leave one question" }), schedulerPool);
    let calls = 0;
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => "enforce", execute: async (_config, input, context) => {
      calls++;
      if (calls === 3) throw new Error("target_http_500");
      return observation(input, context);
    } });
    const [first, second, third] = await f.steps(run.id);
    await worker.handle(job(f.orgId, first));
    expect(await balances(f.orgId)).toEqual({ available: B(0), held: B(0) });
    await worker.handle(job(f.orgId, second));
    expect(calls).toBe(1);
    expect((await owner.query("SELECT status,reason_code FROM evals.run WHERE id=$1", [run.id])).rows[0]).toEqual({ status: "paused", reason_code: "credits_exhausted" });
    expect((await owner.query("SELECT status,reason_code FROM evals.case_unit WHERE id=$1", [second.unit])).rows[0]).toEqual({ status: "pending", reason_code: "credits_exhausted" });
    // Resuming needs credits for what is left; with them, resume re-queues the paused work.
    await expect(controlRun(f.scope, run.id, "resume")).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED" });
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => grantCredits(db, { orgId: f.orgId, key: `grant-${randomUUID()}`, amountUcr: c(50), source: "grant" }), schedulerPool);
    await controlRun(f.scope, run.id, "resume");
    expect((await owner.query("SELECT status,reason_code FROM evals.run WHERE id=$1", [run.id])).rows[0]).toEqual({ status: "queued", reason_code: null });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.workflow_step WHERE id=ANY($1::uuid[]) AND status='queued'", [[second.id, third.id]])).rows[0].n).toBe(2);
    await worker.handle(job(f.orgId, second));
    await worker.handle(job(f.orgId, third));
    const actions = await entries(f.orgId, "action");
    expect(actions.map(row => [row.meter, B(row.amount_ucr), row.case_unit_id])).toEqual([
      ["api_question", -runApi, first.unit], ["api_question", -runApi, second.unit]]);
    expect((await owner.query("SELECT status FROM evals.case_unit WHERE id=$1", [third.unit])).rows[0].status).toBe("target_error");
    expect(await issues(f.orgId)).toEqual([]);
  }, 30_000);

  it("leaves admission, meters and runs alone in shadow and off modes", async () => {
    for (const mode of ["off", "shadow"] as const) {
      setMode(mode);
      const f = await apiEvaluation(2);
      const run = await createSelfServiceRun(f.scope, { evaluationId: f.evaluationId }, randomUUID());
      const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => mode, execute: async (_config, input, context) => observation(input, context) });
      for (const step of await f.steps(run.id)) await worker.handle(job(f.orgId, step));
      expect((await owner.query("SELECT status FROM evals.run WHERE id=$1", [run.id])).rows[0].status).toBe("completed");
      expect(await entries(f.orgId)).toEqual([]);
      expect((await shadow(f.orgId, "action")).map(row => [row.meter, B(row.amount_ucr), row.would_block])).toEqual(mode === "off" ? [] : [["api_question", await meterRate(await runRevision(run.id), "api_question"), true], ["api_question", await meterRate(await runRevision(run.id), "api_question"), true]]);
    }
  }, 30_000);

  /* ------------------------------------ per-workspace override (L-14) --- */

  async function override(orgId: string, enforcement: EnforcementOverride) {
    const adminId = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Override admin\',$2,true)', [adminId, `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [adminId]);
    return withTenant({ orgId, actorId: adminId }, db => setWorkspaceOverride(db, { orgId, enforcement, livePayments: false, plansV2: false, reason: "L-14 engine override test" }));
  }

  it("enforces credits for an overridden workspace while BILLING_ENFORCE is shadow, and the reverse (L-14)", async () => {
    // Process mode shadow, workspace overridden to enforce: admission refuses without credits, meters are real.
    setMode("shadow");
    const f = await apiEvaluation(2);
    await override(f.orgId, "enforce");
    await expect(createSelfServiceRun(f.scope, { evaluationId: f.evaluationId }, randomUUID())).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED", status: 402 });
    const required = await withTenant(f.scope, db => admissionRequirementUcr(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: f.revisionId }));
    await withTenant({ orgId: f.orgId, actorId: SYSTEM }, db => grantCredits(db, { orgId: f.orgId, key: `grant-${randomUUID()}`, amountUcr: required.requiredUcr + c(5), source: "grant" }), schedulerPool);
    const run = await createSelfServiceRun(f.scope, { evaluationId: f.evaluationId }, randomUUID());
    const shadowWorker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => "shadow", execute: async (_config, input, context) => observation(input, context) });
    for (const step of await f.steps(run.id)) await shadowWorker.handle(job(f.orgId, step));
    const api = await meterRate(await runRevision(run.id), "api_question");
    expect((await entries(f.orgId, "action")).map(row => [row.meter, B(row.amount_ucr)])).toEqual([["api_question", -api], ["api_question", -api]]);
    expect(await shadow(f.orgId)).toEqual([]);
    // The scheduler records no shadow admission for an enforced workspace.
    expect(await runShadowAdmissions({ orgId: f.orgId, actorId: SYSTEM }, "shadow")).toBe(0);
    // Enforcement cannot change while a run of the workspace is in flight.
    await owner.query("UPDATE evals.run SET status='running' WHERE id=$1", [run.id]);
    await expect(override(f.orgId, "inherit")).rejects.toMatchObject({ code: "WORKSPACE_BUSY" });
    await owner.query("UPDATE evals.run SET status='completed' WHERE id=$1", [run.id]);
    expect(await issues(f.orgId)).toEqual([]);

    // Process mode enforce, workspace overridden to shadow: no credits needed, shadow entries only.
    setMode("enforce");
    const g = await apiEvaluation(2);
    await override(g.orgId, "shadow");
    const free = await createSelfServiceRun(g.scope, { evaluationId: g.evaluationId }, randomUUID());
    const enforceWorker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => "enforce", execute: async (_config, input, context) => observation(input, context) });
    for (const step of await g.steps(free.id)) await enforceWorker.handle(job(g.orgId, step));
    expect((await owner.query("SELECT status FROM evals.run WHERE id=$1", [free.id])).rows[0].status).toBe("completed");
    expect(await entries(g.orgId)).toEqual([]);
    expect((await shadow(g.orgId, "action")).map(row => [row.meter, row.would_block])).toEqual([["api_question", true], ["api_question", true]]);

    // BILLING_CREDITS_ENABLED=false stays the kill switch: an enforce override does nothing.
    setMode("off");
    const h = await apiEvaluation(1);
    await override(h.orgId, "enforce");
    const off = await createSelfServiceRun(h.scope, { evaluationId: h.evaluationId }, randomUUID());
    for (const step of await h.steps(off.id)) await new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => "off", execute: async (_config, input, context) => observation(input, context) }).handle(job(h.orgId, step));
    expect(await entries(h.orgId)).toEqual([]);
    expect(await shadow(h.orgId)).toEqual([]);
  }, 60_000);

  it("settles a call held in shadow mode in shadow mode after its workspace switches to enforce (L-14)", async () => {
    setMode("shadow");
    const f = await workspace();
    // No run in flight, so enforcement may change (the fixture's imported run is done with).
    await owner.query("UPDATE evals.run SET status='completed' WHERE org_id=$1", [f.orgId]);
    const { jobs } = await engineSteps(f, 1);
    // Claim and hold in shadow mode, then switch the workspace to enforce before the answer is settled.
    let switched = false;
    const worker = f.engine("shadow", async () => {
      if (!switched) { switched = true; await override(f.orgId, "enforce"); }
      return answer(CALL);
    });
    await worker.handle(jobs[0]);
    expect(await entries(f.orgId)).toEqual([]);
    const holds = await shadow(f.orgId, "hold"), captures = await shadow(f.orgId, "capture");
    expect(holds).toHaveLength(1);
    expect(captures).toHaveLength(1);
    const today = new Date().toISOString().slice(0, 10);
    const diff = await withTenant({ orgId: "", actorId: SYSTEM }, async db => (await db.query("SELECT billing.shadow_diff($1::date,$2::uuid) AS d", [today, f.orgId])).rows[0].d, schedulerPool);
    expect(diff.checks.completed_without_capture).toBe(0);
  });

  /* ---------------------------------------------- monthly window (G8) --- */

  it("does not accumulate the workspace euro budget across months (frozen clock)", async () => {
    const f = await minimalFixture();
    try {
      await f.pool.query("UPDATE evals.execution_budget SET ceiling=10 WHERE id=$1", [f.workspaceBudgetId]);
      vi.useFakeTimers({ toFake: ["Date"] });
      const spend = async (amount: string) => {
        const task = await f.enqueue();
        await f.tx(f.tenant, async db => {
          const attemptId = await seedAttempt(db, f.orgId, task.job.stepId, f.providerId, f.priceId);
          await reserve(db, { orgId: f.orgId, attemptId, accountId: f.accountId, workspaceBudgetId: f.workspaceBudgetId, runBudgetId: task.runBudgetId, runId: task.runId, amount, currency: "EUR" });
          await settle(db, f.orgId, attemptId, amount, "reported_usage");
        });
      };
      vi.setSystemTime(new Date("2026-10-31T23:50:00Z"));
      await spend("9.000000000");
      await expect(spend("2.000000000")).rejects.toBeInstanceOf(BudgetExceeded);
      vi.setSystemTime(new Date("2026-11-01T00:05:00Z"));
      await spend("9.000000000");
      await expect(spend("2.000000000")).rejects.toBeInstanceOf(BudgetExceeded);
      vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
      await spend("9.000000000");
      const budget = (await f.pool.query("SELECT settled::text,period_base::text,period_start FROM evals.execution_budget WHERE id=$1", [f.workspaceBudgetId])).rows[0];
      expect(budget).toMatchObject({ settled: "27.000000000", period_base: "18.000000000" });
      expect(new Date(budget.period_start).toISOString()).toBe("2026-12-01T00:00:00.000Z");
      // Run budgets keep their lifetime total.
      expect((await f.pool.query("SELECT count(*)::int AS n FROM evals.execution_budget WHERE kind='run' AND (period_start IS NOT NULL OR period_base<>0)")).rows[0].n).toBe(0);
    } finally { vi.useRealTimers(); await f.close(); }
  });

  it("keeps the window's base within the lifetime total on the production schema", async () => {
    const f = await workspace();
    const budget = (await owner.query("SELECT id,settled FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace'", [f.orgId])).rows[0];
    await expect(owner.query("UPDATE evals.execution_budget SET period_base=settled+1 WHERE id=$1", [budget.id])).rejects.toThrow("execution_budget_period");
    const run = (await owner.query("SELECT id FROM evals.execution_budget WHERE org_id=$1 AND kind='run' LIMIT 1", [f.orgId])).rows[0];
    if (run) await expect(owner.query("UPDATE evals.execution_budget SET period_start=now() WHERE id=$1", [run.id])).rejects.toThrow("execution_budget_period");
  });
});
