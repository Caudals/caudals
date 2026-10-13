import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createSelfServiceRun } from "../../lib/evals/repositories/stage-c";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import type { CandidateInput } from "../../lib/evals/contracts/projections";
import type { InvocationContext } from "../../lib/evals/contracts/connectors";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { verifyContentHash, withContentHash } from "../../lib/evals/contracts/hashing";
import { createPrefixedId } from "../../lib/operator/ids";
import { AI_DISCLOSURE_EXTENSION, OPENING_MESSAGE, PERSON_QUESTION } from "../../lib/evals/scoring/disclosure";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

/**
 * The AI-disclosure check in product runs (launch L-29): one per run, on the
 * first case unit, inside its fenced attempt and the call ledger. The case's
 * observation, status and charge are unchanged; a failed probe never fails it.
 */
describe.skipIf(!ownerUrl || !runtimeUrl)("AI-disclosure probe in product runs on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const browserPool = new Pool({ connectionString: ownerUrl, max: 4 });
  browserPool.on("connect", client => { void client.query("SET ROLE evals_browser"); });
  afterAll(async () => { await Promise.all([owner.end(), browserPool.end(), getEvalsPool().end()]); });
  const tx: TenantTransaction = (scope, fn) => withTenant(scope, fn, browserPool);

  async function seed(caseCount: number, kind: "website" | "openai_compatible" = "website") {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID();
    const evaluationId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID(), recipeId = randomUUID();
    const fixture = syntheticAccountingFixture(actorId), scope = { orgId, actorId };
    const { content_hash: _hash, ...base } = fixture.cases[0];
    const cases = Array.from({ length: caseCount }, (_, index) => withContentHash({ ...base, case_id: randomUUID(), revision_id: randomUUID(), family_id: randomUUID(),
      scenario: { ...base.scenario, messages: [{ role: "user" as const, content: `Question ${index + 1}` }] } }));
    const limits = { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60_000, repetitions: 1 };
    const config = kind === "website"
      ? { schema_version: "1.0", target_revision_id: revisionId, kind: "website", endpoint: "https://chat.example.test/", recipe_revision_id: recipeId, login_session_id: null, limits, requests_per_minute: 1000, concurrent_sessions: 1, reset: "fresh_session" }
      : { schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible", endpoint: "https://chat.example.test/v1/chat/completions", model: "acme-bot", credential: { kind: "none" }, limits, requests_per_minute: 1000, concurrent_sessions: 1, reset: "fresh_session" };
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
  const observations = async (runId: string) => (await owner.query("SELECT o.document, cu.status FROM evals.observation o JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id) WHERE o.run_id=$1 ORDER BY cu.created_at, cu.id", [runId])).rows as Array<{ document: { messages: Array<{ role: string; content: string }>; extensions: Record<string, unknown>; content_hash: string }; status: string }>;
  const calls = async (runId: string) => (await owner.query("SELECT c.state, count(*)::int AS n FROM evals.target_invocation_call c JOIN evals.target_invocation_ledger l ON (l.org_id,l.attempt_id)=(c.org_id,c.attempt_id) WHERE l.run_id=$1 GROUP BY c.state ORDER BY c.state", [runId])).rows;

  it("asks a website the question as a follow-up on the first case only, and keeps the case as it was", async () => {
    const f = await seed(3);
    const asked: string[][] = [];
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), disclosure: () => true, execute: async (_config, input, context) => {
      asked.push(input.messages.map((message) => message.content));
      return answer(input, context, question(input) === PERSON_QUESTION.en ? "No, I'm a virtual assistant. I can still help with invoices." : "EUR 135.80");
    } });
    await drain(f.orgId, f.run.id, worker);
    const rows = await observations(f.run.id);
    expect(rows.map((row) => row.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
    const checked = rows.filter((row) => row.document.extensions[AI_DISCLOSURE_EXTENSION]);
    expect(checked).toHaveLength(1);
    expect(checked[0]).toBe(rows[0]);
    // The case keeps its own two messages; the follow-up lives only in the check's transcript.
    expect(checked[0].document.messages).toHaveLength(2);
    expect(() => verifyContentHash(checked[0].document)).not.toThrow();
    expect(checked[0].document.extensions[AI_DISCLOSURE_EXTENSION]).toMatchObject({
      status: "disclosed", reason: "self_identified", method: "pattern", scored: false, language: "en",
      evidence: { turn: "person_answer", quote: "No, I'm a virtual assistant." },
    });
    const followUp = asked.find((messages) => messages.at(-1) === PERSON_QUESTION.en)!;
    expect(followUp).toHaveLength(3);
    // Every call is in the ledger, recorded; nothing is left unknown.
    expect(await calls(f.run.id)).toEqual([{ state: "recorded", n: 4 }]);
    expect(await runRow(f.run.id)).toMatchObject({ phase: "grading" });
  }, 30000);

  it("asks an API the opening and the question in fresh conversations", async () => {
    const f = await seed(2, "openai_compatible");
    const asked: string[][] = [];
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), disclosure: () => true, execute: async (_config, input, context) => {
      asked.push(input.messages.map((message) => message.content));
      const last = question(input);
      return answer(input, context, last === PERSON_QUESTION.en ? "Yes, I'm a real person on the billing team." : last === OPENING_MESSAGE.en ? "Hello! Ask me about invoices." : "EUR 135.80");
    } });
    await drain(f.orgId, f.run.id, worker);
    expect(asked.filter((messages) => messages.length === 1 && [OPENING_MESSAGE.en, PERSON_QUESTION.en].includes(messages[0]))).toHaveLength(2);
    const [first] = await observations(f.run.id);
    expect(first.document.extensions[AI_DISCLOSURE_EXTENSION]).toMatchObject({ status: "not_disclosed", reason: "claimed_human" });
    expect((first.document.extensions[AI_DISCLOSURE_EXTENSION] as { transcript: Array<{ kind: string }> }).transcript.map((turn) => turn.kind)).toEqual(["opening", "first_reply", "person_question", "person_answer"]);
    expect(await calls(f.run.id)).toEqual([{ state: "recorded", n: 4 }]);
  }, 30000);

  it("records a failed question in the transcript without failing the case", async () => {
    const f = await seed(1);
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), disclosure: () => true, execute: async (_config, input, context) => {
      if (question(input) === PERSON_QUESTION.en) throw new Error("capture_incomplete");
      return answer(input, context);
    } });
    await drain(f.orgId, f.run.id, worker);
    const [row] = await observations(f.run.id);
    expect(row.status).toBe("succeeded");
    expect(row.document.extensions[AI_DISCLOSURE_EXTENSION]).toMatchObject({ status: "unclear", reason: "not_captured" });
    // A failed browser turn is recorded with its reason, never an unknown liability.
    expect(await calls(f.run.id)).toEqual([{ state: "recorded", n: 2 }]);
  }, 30000);

  it("changes nothing while the flag is off", async () => {
    const f = await seed(2);
    let count = 0;
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: f.scope.actorId, workerId: randomUUID(), disclosure: () => false, execute: async (_config, input, context) => { count++; return answer(input, context); } });
    await drain(f.orgId, f.run.id, worker);
    expect(count).toBe(2);
    expect((await observations(f.run.id)).every((row) => !row.document.extensions[AI_DISCLOSURE_EXTENSION])).toBe(true);
  }, 30000);
});
