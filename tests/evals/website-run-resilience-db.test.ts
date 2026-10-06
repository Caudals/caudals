import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createSelfServiceRun, controlRun } from "../../lib/evals/repositories/stage-c";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import type { CandidateInput } from "../../lib/evals/contracts/projections";
import type { InvocationContext } from "../../lib/evals/contracts/connectors";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

/**
 * Real websites miss a reply now and then. A failed browser attempt is retried
 * in a fresh browser, one test that keeps failing does not stop the run, and
 * only a connection that looks broken pauses it for repair. Finishing a paused
 * run grades the answers already captured.
 */
describe.skipIf(!ownerUrl || !runtimeUrl)("website run resilience on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const browserPool = new Pool({ connectionString: ownerUrl, max: 4 });
  browserPool.on("connect", client => { void client.query("SET ROLE evals_browser"); });
  afterAll(async () => { await Promise.all([owner.end(), browserPool.end(), getEvalsPool().end()]); });
  const tx: TenantTransaction = (scope, fn) => withTenant(scope, fn, browserPool);

  async function seed(caseCount: number) {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID();
    const evaluationId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID(), recipeId = randomUUID();
    const fixture = syntheticAccountingFixture(actorId), scope = { orgId, actorId };
    const { content_hash: _hash, ...base } = fixture.cases[0];
    const cases = Array.from({ length: caseCount }, (_, index) => withContentHash({ ...base, case_id: randomUUID(), revision_id: randomUUID(), family_id: randomUUID(),
      scenario: { ...base.scenario, messages: [{ role: "user" as const, content: `Question ${index + 1}` }] } }));
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "website", endpoint: "https://chat.example.test/", recipe_revision_id: recipeId, login_session_id: null,
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60_000, repetitions: 1 }, requests_per_minute: 1000, concurrent_sessions: 1, reset: "fresh_session" };
    const recipe = withContentHash({ schema_version: "1.0", recipe_revision_id: recipeId, source: "operator_authored", start_url: config.endpoint, launcher: null, frame_chain: [], input: { kind: "test_id", value: "prompt", frames: [] }, submit: { kind: "press_enter" }, message_container: { kind: "css", value: ".reply", frames: [] }, assistant_message: { kind: "css", value: ".reply", frames: [] }, completion: { kind: "quiescent", quiet_ms: 1500 }, reset: { kind: "new_context" }, assistant_extraction: "last_new_message", created_at: new Date().toISOString(), extensions: {} });
    const evidence = { checked_at: new Date().toISOString(), messages: [{ prompt_hash: "a".repeat(64), response_hash: "b".repeat(64) }, { prompt_hash: "c".repeat(64), response_hash: "d".repeat(64) }], distinct_responses: true, reset_verified: true, streaming_complete: true, duplicate_free: true, screenshot_artifact_id: null, trace_artifact_id: null };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Website fixture\',$2,true)', [actorId, `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Website fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Website fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Chat')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
      await db.query("INSERT INTO evals.website_recipe_revision(id,org_id,project_id,target_id,content_hash,document,probe_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)", [recipeId, orgId, projectId, targetId, recipe.content_hash, recipe, evidence]);
      await db.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report) VALUES($1,$2,'ready',$3)", [orgId, revisionId, { features: [{ capability: "text", status: "supported" }] }]);
      await db.query("INSERT INTO evals.authorization_record(org_id,project_id,target_id,basis,scope,traffic_limit,expires_at) VALUES($1,$2,$3,'workspace_member_attestation',$4,'{}',now()+interval '1 day')", [orgId, projectId, targetId, { endpoint: config.endpoint }]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [fixture.rubric.revision_id, orgId, projectId, fixture.rubric.content_hash, fixture.rubric]);
      for (const item of cases) {
        await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, fixture.rubric.revision_id]);
      }
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Website tests')", [suiteId, orgId, projectId]);
      const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [], case_revisions: cases.map(item => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split })), source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      for (const [ordinal, item] of cases.entries()) await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_suite_version_id,selected_target_revision_id) VALUES($1,$2,$3,'Website evaluation','source_grounded',10,'EUR','ready',$4,$5)", [evaluationId, orgId, projectId, suiteVersionId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const run = await createSelfServiceRun(scope, { evaluationId }, randomUUID());
    return { scope, orgId, run, revisionId, cases };
  }

  const answer = (input: CandidateInput, context: InvocationContext, content = "EUR 135.80") => {
    const unknown = { value: null, provenance: "unavailable" as const };
    return withContentHash({ schema_version: "1.0" as const, observation_id: randomUUID(), run_id: context.run_id, case_revision_id: input.case_revision_id, repetition: 0, attempt_id: context.attempt_id, target_revision_id: context.target_revision_id, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), messages: [...input.messages, { role: "assistant" as const, content }], tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded" as const, error: null, metadata: { latency_ms: { value: 1, provenance: "measured" as const }, input_tokens: unknown, output_tokens: unknown, cost: unknown, model_identity: unknown }, extensions: {} });
  };
  const question = (input: CandidateInput) => input.messages.at(-1)!.content;

  /** Delivers every due step, the way the outbox does, until nothing is runnable. */
  async function drain(orgId: string, runId: string, worker: TargetExecutionWorker, rounds = 30) {
    for (let round = 0; round < rounds; round++) {
      await owner.query("UPDATE evals.workflow_step SET not_before=now() WHERE org_id=$1 AND status='queued'", [orgId]);
      const steps = (await owner.query(`SELECT s.id,s.input_hash FROM evals.workflow_step s JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
        WHERE w.run_id=$1 AND s.status='queued' ORDER BY s.created_at,s.id`, [runId])).rows;
      if (!steps.length) return;
      for (const step of steps) await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });
    }
  }
  const runRow = async (runId: string) => (await owner.query("SELECT status,phase,reason_code FROM evals.run WHERE id=$1", [runId])).rows[0];

  it("retries a missed reply in a fresh browser and keeps going when one test never answers", async () => {
    const f = await seed(3);
    const attempts = new Map<string, number>();
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async (_config, input, context) => {
      const asked = question(input);
      attempts.set(asked, (attempts.get(asked) ?? 0) + 1);
      if (asked === "Question 1" && attempts.get(asked) === 1) throw new Error("capture_incomplete");
      if (asked === "Question 3") throw new Error("website_selector_failed");
      return answer(input, context);
    } });
    await drain(f.orgId, f.run.id, worker);
    expect(Object.fromEntries(attempts)).toEqual({ "Question 1": 2, "Question 2": 1, "Question 3": 3 });
    const units = (await owner.query("SELECT status,count(*)::int AS n FROM evals.case_unit WHERE run_id=$1 GROUP BY status ORDER BY status", [f.run.id])).rows;
    expect(units).toEqual([{ status: "capture_incomplete", n: 1 }, { status: "succeeded", n: 2 }]);
    expect(await runRow(f.run.id)).toMatchObject({ status: "partial", phase: "grading" });
    // A browser attempt has no external charge: nothing is left as an unknown liability.
    const ledger = (await owner.query("SELECT state,count(*)::int AS n FROM evals.target_invocation_ledger WHERE run_id=$1 GROUP BY state ORDER BY state", [f.run.id])).rows;
    expect(ledger).toEqual([{ state: "recorded", n: 6 }]);
    const repair = await owner.query("SELECT 1 FROM evals.connection_check WHERE target_revision_id=$1 AND status='needs_operator'", [f.revisionId]);
    expect(repair.rowCount).toBe(0);
  }, 30000);

  it("asks again when the assistant only reports a temporary error, and records it if it persists", async () => {
    const f = await seed(2);
    const attempts = new Map<string, number>();
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async (_config, input, context) => {
      const asked = question(input);
      attempts.set(asked, (attempts.get(asked) ?? 0) + 1);
      const failing = asked === "Question 2" || attempts.get(asked) === 1;
      return answer(input, context, failing ? "Ha ocurrido un error, por favor, inténtalo más tarde." : "EUR 135.80");
    } });
    await drain(f.orgId, f.run.id, worker);
    expect(Object.fromEntries(attempts)).toEqual({ "Question 1": 2, "Question 2": 3 });
    const replies = (await owner.query("SELECT o.document->'messages'->-1->>'content' AS reply FROM evals.observation o WHERE o.run_id=$1 ORDER BY o.created_at", [f.run.id])).rows.map(row => row.reply);
    expect(replies).toEqual(["EUR 135.80", "Ha ocurrido un error, por favor, inténtalo más tarde."]);
    expect(await runRow(f.run.id)).toMatchObject({ status: "completed", phase: "grading" });
  }, 30000);

  it("pauses only when the connection looks broken, resumes, and finishing grades the captured answers", async () => {
    const f = await seed(6);
    let broken = true;
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async (_config, input, context) => {
      if (question(input) !== "Question 1" && broken) throw new Error("capture_incomplete");
      return answer(input, context);
    } });
    await drain(f.orgId, f.run.id, worker);
    // Question 1 answered, then three tests in a row failed after their retries.
    expect(await runRow(f.run.id)).toMatchObject({ status: "paused", reason_code: "capture_incomplete" });
    const counts = (await owner.query("SELECT status,count(*)::int AS n FROM evals.case_unit WHERE run_id=$1 GROUP BY status ORDER BY status", [f.run.id])).rows;
    expect(counts).toEqual([{ status: "capture_incomplete", n: 3 }, { status: "queued", n: 2 }, { status: "succeeded", n: 1 }]);
    expect((await owner.query("SELECT error_code FROM evals.connection_check WHERE target_revision_id=$1 AND status='needs_operator'", [f.revisionId])).rows).toEqual([{ error_code: "capture_incomplete" }]);

    // The site recovers: resuming continues with the remaining tests.
    broken = false;
    await controlRun(f.scope, f.run.id, "resume");
    await drain(f.orgId, f.run.id, worker);
    expect(await runRow(f.run.id)).toMatchObject({ status: "partial", phase: "grading" });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.case_unit WHERE run_id=$1 AND status='succeeded'", [f.run.id])).rows[0].n).toBe(3);
  }, 30000);

  it("finishing a paused run sends its captured answers to grading", async () => {
    const f = await seed(6);
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async (_config, input, context) => {
      if (question(input) !== "Question 1") throw new Error("capture_incomplete");
      return answer(input, context);
    } });
    await drain(f.orgId, f.run.id, worker);
    expect(await runRow(f.run.id)).toMatchObject({ status: "paused" });
    await controlRun(f.scope, f.run.id, "cancel");
    expect(await runRow(f.run.id)).toMatchObject({ status: "partial", phase: "grading" });
  }, 30000);

  it("pauses immediately on a website usage limit without retrying or grading an empty reply", async () => {
    const f = await seed(3);
    let calls = 0;
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), execute: async () => {
      calls++; throw new Error("website_usage_limit");
    } });
    await drain(f.orgId, f.run.id, worker);
    expect(calls).toBe(1);
    expect(await runRow(f.run.id)).toMatchObject({ status: "paused", reason_code: "website_usage_limit" });
    expect((await owner.query("SELECT error_code FROM evals.connection_check WHERE target_revision_id=$1 AND status='needs_operator'", [f.revisionId])).rows).toEqual([{ error_code: "website_usage_limit" }]);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.observation WHERE run_id=$1", [f.run.id])).rows[0].n).toBe(0);
  }, 30000);
});
