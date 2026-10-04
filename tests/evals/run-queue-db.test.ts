import { randomUUID } from "node:crypto";
import type { Request as QueueRequest } from "pg-boss";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createSelfServiceRun, controlRun } from "../../lib/evals/repositories/stage-c";
import { lockRunQueue, startQueuedRun } from "../../lib/evals/repositories/run-capacity";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import { dispatchOutbox, type JobData } from "../../lib/evals/queue/boss";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
describe.skipIf(!ownerUrl || !runtimeUrl)("workspace run queue on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 4 });
  const browserPool = new Pool({ connectionString: ownerUrl, max: 4 });
  workerPool.on("connect", client => { void client.query("SET ROLE evals_worker"); });
  browserPool.on("connect", client => { void client.query("SET ROLE evals_browser"); });
  afterAll(async () => { await Promise.all([owner.end(), workerPool.end(), browserPool.end(), getEvalsPool().end()]); });
  const tx: TenantTransaction = (scope, fn) => withTenant(scope, fn, workerPool);
  const browserTx: TenantTransaction = (scope, fn) => withTenant(scope, fn, browserPool);

  async function seed() {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID();
    const evaluationId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID();
    const fixture = syntheticAccountingFixture(actorId), item = fixture.cases[0], scope = { orgId, actorId };
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible", endpoint: "https://example.test/v1", model: "fixture", credential: { kind: "none" }, limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 1000, concurrent_sessions: 100, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
    await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Queue fixture\',$2,true)', [actorId, `${randomUUID()}@example.test`]);
    await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Queue fixture',$2)", [orgId, actorId]);
    await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
    await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Queue fixture')", [projectId, orgId]);
    await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture')", [targetId, orgId, projectId]);
    await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
    await db.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report) VALUES($1,$2,'ready',$3)", [orgId, revisionId, { features: [{ capability: "text", status: "supported" }] }]);
    await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [fixture.rubric.revision_id, orgId, projectId, fixture.rubric.content_hash, fixture.rubric]);
    await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
    await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, fixture.rubric.revision_id]);
    await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Own tests')", [suiteId, orgId, projectId]);
    const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [], case_revisions: [{ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split }], source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
    await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
    await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgId, suiteVersionId, item.revision_id]);
    await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_suite_version_id,selected_target_revision_id) VALUES($1,$2,$3,'Queued evaluation','source_grounded',10,'EUR','ready',$4,$5)", [evaluationId, orgId, projectId, suiteVersionId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const create = (key = randomUUID()) => createSelfServiceRun(scope, { evaluationId }, key);
    const job = async (runId: string): Promise<JobData> => {
      const row = (await owner.query("SELECT s.id,s.input_hash FROM evals.workflow_step s JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id) WHERE w.run_id=$1", [runId])).rows[0];
      return { orgId, stepId: row.id, inputHash: row.input_hash };
    };
    const status = async (runId: string) => (await owner.query("SELECT status FROM evals.run WHERE id=$1", [runId])).rows[0].status;
    return { scope, create, job, status, orgId, evaluationId, item };
  }

  it("queues while occupied, defers without attempts, preserves FIFO across redelivery and releases on completion", async () => {
    const f = await seed();
    const calls: string[] = [];
    let signal!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { signal = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const worker = (transaction: TenantTransaction) => new TargetExecutionWorker({ tx: transaction, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async (_config, input, context) => {
      calls.push(context.run_id);
      if (calls.length === 1) { signal(); await held; }
      const unknown = { value: null, provenance: "unavailable" as const };
      return withContentHash({ schema_version: "1.0" as const, observation_id: randomUUID(), run_id: context.run_id, case_revision_id: input.case_revision_id, repetition: 0, attempt_id: context.attempt_id, target_revision_id: context.target_revision_id, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), messages: [...input.messages, { role: "assistant" as const, content: "EUR 135.80" }], tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded" as const, error: null, metadata: { latency_ms: { value: 1, provenance: "measured" as const }, input_tokens: unknown, output_tokens: unknown, cost: unknown, model_identity: unknown }, extensions: {} });
    } });
    const first = await f.create(), a = worker(tx), b = worker(browserTx);
    const running = a.handle(await f.job(first.id));
    await Promise.race([started, running.then(() => { throw new Error("First run was not dispatched"); })]);
    try {
      const key = randomUUID(), second = await f.create(key);
      expect((await f.create(key)).id).toBe(second.id);
      const third = await f.create();
      await Promise.all([a.handle(await f.job(second.id)), b.handle(await f.job(third.id))]);
      expect(await f.status(second.id)).toBe("queued");
      expect(calls).toEqual([first.id]);
      expect((await owner.query("SELECT count(*)::int AS n FROM evals.target_attempt WHERE org_id=$1", [f.orgId])).rows[0].n).toBe(1);
      expect((await owner.query("SELECT count(*)::int AS n FROM evals.outbox_event WHERE org_id=$1 AND delivered_at IS NULL AND available_at>now()", [f.orgId])).rows[0].n).toBe(2);
      release(); await running;
      // A later job delivered first cannot steal the next slot.
      await b.handle(await f.job(third.id));
      expect(calls).toEqual([first.id]);
      // Deliver the durable deferred jobs through the actual outbox path.
      await owner.query("UPDATE evals.outbox_event SET available_at=now() WHERE org_id=$1", [f.orgId]);
      await dispatchOutbox({ send: async (queue: string | QueueRequest, data?: object | null) => { await a.handle((typeof queue === "string" ? data : queue.data) as JobData); return randomUUID(); } }, tx, f.scope);
      // A retry of an already completed step cannot execute again.
      await a.handle(await f.job(second.id));
      await b.handle(await f.job(third.id));
      expect(calls).toEqual([first.id, second.id, third.id]);
      expect(await f.status(third.id)).toBe("completed");
    } finally { release(); await running; }
  }, 15000);

  it("serializes concurrent admission, isolates tenants, queues resumes behind waiting runs and retains draining slots", async () => {
    const f = await seed(), other = await seed();
    const [a, b, c] = await Promise.all([f.create(), f.create(), f.create()]);
    const admit = (runId: string, transaction = tx, scope = f.scope) => transaction(scope, async db => { await lockRunQueue(db, scope.orgId); return startQueuedRun(db, scope.orgId, runId); });
    const results = await Promise.all([admit(a.id), admit(b.id, browserTx), admit(c.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const activeId = [a,b,c][results.indexOf(true)].id;
    const anotherTenant = await other.create();
    expect(await admit(anotherTenant.id, tx, other.scope)).toBe(true);
    expect(await admit(anotherTenant.id)).toBe(false);
    await controlRun(f.scope, activeId, "pause");
    expect(await f.status(activeId)).toBe("paused");
    await owner.query("UPDATE evals.case_unit SET status='running' WHERE run_id=$1", [activeId]);
    expect(await admit([a,b,c].find(r => r.id !== activeId)!.id)).toBe(false);
    await owner.query("UPDATE evals.case_unit SET status='queued' WHERE run_id=$1", [activeId]);
    await controlRun(f.scope, activeId, "resume");
    expect(await admit(activeId)).toBe(false);
    for (const row of [a,b,c].filter(r => r.id !== activeId)) await controlRun(f.scope, row.id, "cancel");
    expect(await admit(activeId)).toBe(true);
    await expect(withTenant(f.scope, db => db.query("UPDATE evals.workspace_entitlement SET max_active_runs=99 WHERE org_id=$1", [f.orgId]))).rejects.toThrow(/permission denied/);
    await owner.query("UPDATE evals.workspace_entitlement SET max_active_runs=0 WHERE org_id=$1", [f.orgId]);
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
    await owner.query("UPDATE evals.workspace_entitlement SET max_active_runs=1,monthly_spend_limit=0 WHERE org_id=$1", [f.orgId]);
    await expect(f.create()).rejects.toMatchObject({ code: "BUDGET_PAUSED" });
  });
});
