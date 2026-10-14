/**
 * Launch L-19 on the production schema (spec v2 P-25, P-27, P-28, §6.7,
 * §6.10): `runs:write` tokens (flagged, short-lived, audited), the CI trigger
 * through the product's run path (one run per Idempotency-Key under
 * concurrent retries, plan limits, credit admission and caps, the run-start
 * limit), the release gate on real runs (thresholds on the test set and the
 * schedule), and Slack/Teams/email destinations: egress checks, encrypted
 * credentials, test send, deletion, and L-18's summary delivered through them
 * while the generic signed webhook stays unchanged. Database:
 * scripts/evals/test-db.sh.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { authenticateCustomerToken, createCustomerToken, revokeCustomerToken } from "../../lib/evals/monitoring/tokens";
import { listGateThresholds, runGate, saveSuiteGateThreshold, startApiRun } from "../../lib/evals/monitoring/ci-runs";
import { createSchedule, listSchedules, tickSchedules, updateSchedule } from "../../lib/evals/monitoring/schedules";
import { tickScheduledAlerts } from "../../lib/evals/monitoring/alerts";
import { createWebhookEndpoint, deleteWebhookEndpoint, listWebhookEndpoints, testWebhookEndpoint, tickWebhookDeliveries, updateWebhookEndpoint } from "../../lib/evals/monitoring/webhooks";
import { loadKeyring } from "../../lib/evals/security/envelope";
import { grantCredits } from "../../lib/billing/ledger";
import { creditsToUcr } from "../../lib/billing/units";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { reviewAssessment, scoreRun } from "../../lib/evals/repositories/managed";
import type { EmailMessage } from "../../lib/evals/operations/notifications";
import { genericGroundedQaPack, syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { CandidateInput } from "../../lib/evals/contracts/projections";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";
const WORKER = "service:evals-worker";
const ENV_KEYS = ["BILLING_CREDITS_ENABLED", "BILLING_ENFORCE", "INTEGRATIONS_V2_ENABLED", "EVALS_WEBHOOK_KEYRING_FILE", "EVALS_WEBHOOK_KEY_VERSION", "EVALS_APP_URL", "BRANDED_EMAILS_ENABLED"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const keyDir = mkdtempSync(path.join(tmpdir(), "l19-keys-"));
const keyFile = path.join(keyDir, "keyring.json");
writeFileSync(keyFile, JSON.stringify({ test: randomBytes(32).toString("base64") }));
const allow = async (input: { limit: number }) => ({ allowed: true, limit: input.limit, remaining: 1, retryAfterSeconds: 0, resetAt: Date.now() + 1000 });
const publicDns = (async () => [{ address: "34.120.0.10", family: 4 }]) as never;
const privateDns = (async () => [{ address: "10.20.0.5", family: 4 }]) as never;
const SLACK = "https://hooks.slack.com/services/T0001/B0001/l19fixturesecretvalue";
const TEAMS = "https://prod-01.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=l19teamssecret";
/** As stored and posted: the URL parser drops the default port. */
const TEAMS_URL = new URL(TEAMS).href;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  process.env.EVALS_WEBHOOK_KEYRING_FILE = keyFile;
  process.env.EVALS_WEBHOOK_KEY_VERSION = "test";
  process.env.EVALS_APP_URL = "https://app.caudals.test";
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

describe.skipIf(!ownerUrl || !runtimeUrl)("integrations v2: CI trigger, gate and destinations (L-19)", () => {
  process.env.EVALS_DATABASE_URL = runtimeUrl;
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 6 });
  workerPool.on("connect", client => { void client.query("SET ROLE evals_worker"); });
  const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
  afterEach(() => { for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  afterAll(async () => { await Promise.all([owner.end(), workerPool.end(), getEvalsPool().end()]); });

  /* ------------------------------------------------------------ fixtures --- */

  async function user(email = `${randomUUID()}@example.test`) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "L-19 fixture", email]);
    return { id, email };
  }

  /** A pay-as-you-go workspace with an API system, a ready connection and an approved test set of three questions. */
  async function seed(options: { plan?: "payg" | "managed" | "free" } = {}) {
    const ownerUser = await user(`ci-${randomUUID().slice(0, 8)}@acme-l19.com`), viewer = await user();
    const orgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), evaluationId = randomUUID();
    const { source } = syntheticAccountingFixture(ownerUser.id);
    const titles = ["Management fee", "Custody fee", "Instalments"];
    const pack = genericGroundedQaPack({ source, authorId: ownerUser.id, questions: titles.map((title, index) => ({
      question: `Question ${index + 1}: ${title}?`, expected: `Answer ${index + 1}`, anchor: source.anchors[0].id, title, severity: "medium" as const })) });
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible", endpoint: "https://example.test/v1", model: "fixture", credential: { kind: "none" },
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 1000, concurrent_sessions: 100, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [ownerUser.id, orgId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'L-19 fixture',$2)", [orgId, ownerUser.id]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", [orgId, ownerUser.id, viewer.id]);
      await db.query("UPDATE evals.workspace_entitlement SET plan=$2,can_schedule=true,max_runs_per_month=NULL,max_active_runs=20 WHERE org_id=$1", [orgId, options.plan ?? "payg"]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'L-19 fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Support API')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
      await db.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report) VALUES($1,$2,'ready',$3)", [orgId, revisionId, { features: [{ capability: "text", status: "supported" }] }]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [pack.rubric.revision_id, orgId, projectId, pack.rubric.content_hash, pack.rubric]);
      for (const item of pack.cases) {
        await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, pack.rubric.revision_id]);
      }
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_target_revision_id) VALUES($1,$2,$3,'Support assistant','source_grounded',10,'EUR','ready',$4)",
        [evaluationId, orgId, projectId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const suiteId = randomUUID(), suiteVersionId = randomUUID();
    const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [],
      case_revisions: pack.cases.map(item => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split })),
      source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
    await owner.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Approved')", [suiteId, orgId, projectId]);
    await owner.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
    for (const [ordinal, item] of pack.cases.entries()) await owner.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
    await owner.query("UPDATE evals.evaluation SET selected_suite_version_id=$2 WHERE id=$1", [evaluationId, suiteVersionId]);
    return { orgId, projectId, evaluationId, revisionId, suiteId, suiteVersionId, ownerUser, viewer, ownerScope: { orgId, actorId: ownerUser.id }, system: { orgId, actorId: SCHEDULER } };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;

  const runBody = (f: Fixture) => ({ suiteVersionId: f.suiteVersionId, targetRevisionId: f.revisionId });
  const ciToken = (f: Fixture, days = 7) => createCustomerToken(f.ownerScope, { name: "CI", scopes: ["runs:write", "runs:read"], expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() });
  const count = async (sql: string, params: unknown[]) => Number((await owner.query(sql, params)).rows[0].n);
  const grant = (orgId: string, credits: number) => withTenant({ orgId, actorId: SCHEDULER }, db => grantCredits(db, { orgId, key: `grant-${randomUUID()}`, amountUcr: creditsToUcr(credits), source: "grant", reason: "L-19 fixture" }));
  const observation = (input: CandidateInput, context: { run_id: string; attempt_id: string; target_revision_id: string }) => {
    const unknown = { value: null, provenance: "unavailable" as const };
    return withContentHash({ schema_version: "1.0" as const, observation_id: randomUUID(), run_id: context.run_id, case_revision_id: input.case_revision_id, repetition: 0,
      attempt_id: context.attempt_id, target_revision_id: context.target_revision_id, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      messages: [...input.messages, { role: "assistant" as const, content: "An answer." }], tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded" as const, error: null,
      metadata: { latency_ms: { value: 1, provenance: "measured" as const }, input_tokens: unknown, output_tokens: unknown, cost: unknown, model_identity: unknown }, extensions: {} });
  };
  async function execute(f: Fixture, runId: string) {
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => "off", execute: async (_config, input, context) => observation(input, context) });
    const steps = (await owner.query(`SELECT s.id,s.input_hash FROM evals.workflow_step s JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
      WHERE w.run_id=$1 ORDER BY s.created_at,s.id`, [runId])).rows;
    for (const step of steps) await worker.handle({ orgId: f.orgId, stepId: step.id, inputHash: step.input_hash });
  }
  async function decide(f: Fixture, runId: string, outcomes: Record<string, "pass" | "partial" | "fail">) {
    await scoreRun(f.ownerScope, runId, "fixture-deterministic-v1");
    await owner.query("UPDATE evals.judge_job SET status='failed' WHERE run_id=$1 AND status='queued'", [runId]).catch(() => undefined);
    const rows = (await owner.query(`SELECT DISTINCT ON (a.observation_id) a.id,a.document,cr.document->>'title' AS title FROM evals.assessment a
      JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id) JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
      JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id) WHERE o.run_id=$1 ORDER BY a.observation_id,a.created_at DESC,a.id DESC`, [runId])).rows;
    for (const row of rows) {
      const outcome = outcomes[row.title] ?? "pass";
      await reviewAssessment(f.ownerScope, row.id, { decision: "override", reason: "Fixture decision", outcome,
        criteria: row.document.criteria.map((item: { criterion_id: string; rationale: string }) => ({ ...item, score: outcome === "pass" ? 1 : outcome === "partial" ? 0.5 : 0 })) });
    }
    await owner.query("UPDATE evals.run SET status='completed',phase='done' WHERE id=$1", [runId]);
  }

  /* --------------------------------------------------------------- tests --- */

  it("issues runs:write tokens only with the flag, short-lived and audited; read tokens cannot start runs", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "false" });
    const f = await seed();
    await expect(ciToken(f)).rejects.toMatchObject({ code: "INPUT_INVALID", status: 422 });
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    await expect(ciToken(f, 91)).rejects.toMatchObject({ code: "INPUT_INVALID", status: 422 });
    const token = await ciToken(f, 90);
    expect(token.scopes).toEqual(["runs:write", "runs:read"]);
    expect(await authenticateCustomerToken(f.orgId, `Bearer ${token.token}`, "runs:write")).toMatchObject({ tokenId: token.id });
    expect(await authenticateCustomerToken(f.orgId, `Bearer ${token.token}`, ["runs:read", "runs:write"])).toMatchObject({ tokenId: token.id });
    const read = await createCustomerToken(f.ownerScope, { name: "Dashboards", scopes: ["runs:read"], expiresAt: new Date(Date.now() + 200 * 86_400_000).toISOString() });
    await expect(authenticateCustomerToken(f.orgId, `Bearer ${read.token}`, "runs:write")).rejects.toMatchObject({ status: 403 });
    // The database refuses a long-lived write token even past the app.
    await expect(owner.query("INSERT INTO evals.customer_api_token(org_id,name,token_hash,scopes,expires_at,created_by) VALUES($1,'x',$2,ARRAY['runs:write'],now()+interval '200 days','x')",
      [f.orgId, "c".repeat(64)])).rejects.toThrow(/customer_api_token_write_expiry/);
    await revokeCustomerToken(f.ownerScope, token.id);
    await revokeCustomerToken(f.ownerScope, token.id);
    await expect(authenticateCustomerToken(f.orgId, `Bearer ${token.token}`, "runs:write")).rejects.toMatchObject({ status: 403 });
    const audit = (await owner.query("SELECT action,details FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'api_token.%' ORDER BY created_at,id", [f.orgId])).rows;
    expect(audit.map(row => row.action)).toEqual(["api_token.created", "api_token.created", "api_token.revoked"]);
    expect(audit[0].details.scopes).toEqual(["runs:write", "runs:read"]);
  }, 60_000);

  it("starts exactly one run per Idempotency-Key, even under concurrent retries, through the product's run path", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    const f = await seed();
    const token = await ciToken(f);
    const key = `release-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 8 }, () => startApiRun(f.orgId, token.id, runBody(f), key, { limit: allow })));
    expect(new Set(results.map(run => run.run_id)).size).toBe(1);
    expect(results.filter(run => !run.replayed)).toHaveLength(1);
    expect(results[0]).toMatchObject({ evaluation_id: f.evaluationId, suite_version_id: f.suiteVersionId, target_revision_id: f.revisionId, gate_url: `/api/evals/v1/integrations/runs/${results[0].run_id}/gate?orgId=${f.orgId}` });
    expect(await count("SELECT count(*)::int AS n FROM evals.run WHERE org_id=$1", [f.orgId])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM evals.api_run_request WHERE org_id=$1", [f.orgId])).toBe(1);
    // Provenance: the run and its audit event name the token; the key itself is not in the audit trail.
    const run = (await owner.query("SELECT created_by,price_book_revision_id IS NOT NULL AS frozen FROM evals.run WHERE id=$1", [results[0].run_id])).rows[0];
    expect(run).toMatchObject({ created_by: `customer-api-token:${token.id}`, frozen: true });
    const audit = (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='run.started_via_api'", [f.orgId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ token_id: token.id, evaluation_id: f.evaluationId });
    expect(JSON.stringify(audit[0].details)).not.toContain(key);
    // A later replay answers with the same run; the same key for another request is refused; a new key starts a new run.
    expect(await startApiRun(f.orgId, token.id, runBody(f), key, { limit: allow })).toMatchObject({ run_id: results[0].run_id, replayed: true });
    await expect(startApiRun(f.orgId, token.id, { ...runBody(f), evaluationId: f.evaluationId }, key, { limit: allow })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    const second = await startApiRun(f.orgId, token.id, runBody(f), `release-${randomUUID()}`, { limit: allow });
    expect(second.run_id).not.toBe(results[0].run_id);
    expect(await count("SELECT count(*)::int AS n FROM evals.run WHERE org_id=$1", [f.orgId])).toBe(2);
    // Missing or malformed keys are refused before anything is written.
    for (const bad of [null, "short", "x".repeat(201), "has spaces in it"]) {
      await expect(startApiRun(f.orgId, token.id, runBody(f), bad, { limit: allow })).rejects.toMatchObject({ status: 400 });
    }

    // The 096 rollback refuses once a run was started through the API.
    const client = await owner.connect();
    try {
      await expect(client.query(await readFile(new URL("../../db/rollbacks/096_evals_integrations_v2_down.sql", import.meta.url), "utf8"))).rejects.toThrow("Rollback blocked");
    } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
  }, 90_000);

  it("applies the run-start limit, plan limits, credit admission and caps, and refuses what cannot run", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    const f = await seed();
    const token = await ciToken(f);
    // The run-start limit: refused with Retry-After and nothing created.
    await expect(startApiRun(f.orgId, token.id, runBody(f), `limit-${randomUUID()}`, { limit: async input => ({ allowed: false, limit: input.limit, remaining: 0, retryAfterSeconds: 120, resetAt: Date.now() + 120_000 }) }))
      .rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, retryAfterSeconds: 120 });
    expect(await count("SELECT count(*)::int AS n FROM evals.run WHERE org_id=$1", [f.orgId])).toBe(0);
    // A plan's monthly run allowance (database trigger).
    await owner.query("UPDATE evals.workspace_entitlement SET max_runs_per_month=0 WHERE org_id=$1", [f.orgId]);
    await expect(startApiRun(f.orgId, token.id, runBody(f), `plan-${randomUUID()}`, { limit: allow })).rejects.toThrow(/PLAN_LIMIT/);
    await owner.query("UPDATE evals.workspace_entitlement SET max_runs_per_month=NULL WHERE org_id=$1", [f.orgId]);
    // Credits enforced: no credits → 402; enough credits → the run starts, with the L-10 estimate in the answer.
    setEnv({ BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "enforce" });
    await expect(startApiRun(f.orgId, token.id, runBody(f), `credits-${randomUUID()}`, { limit: allow })).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED", status: 402 });
    await grant(f.orgId, 5000);
    const funded = await startApiRun(f.orgId, token.id, runBody(f), `funded-${randomUUID()}`, { limit: allow });
    expect(Number(funded.estimate?.credits.p90)).toBeGreaterThan(0);
    // A monthly cap below the estimate refuses with CAP_REACHED, as in the app.
    await withTenant(f.ownerScope, db => db.query("SELECT billing.set_spend_cap($1,'workspace_monthly',NULL,$2,NULL,NULL)", [f.orgId, "1"]));
    await expect(startApiRun(f.orgId, token.id, runBody(f), `cap-${randomUUID()}`, { limit: allow })).rejects.toMatchObject({ code: "CAP_REACHED", status: 409 });
    expect(await count("SELECT count(*)::int AS n FROM evals.api_run_request WHERE org_id=$1", [f.orgId])).toBe(1);
    // Only the approved test set version runs; another workspace's system is not found; collected answers start in the app.
    await expect(startApiRun(f.orgId, token.id, { ...runBody(f), suiteVersionId: randomUUID() }, `other-${randomUUID()}`, { limit: allow })).rejects.toMatchObject({ status: 404 });
    const other = await seed();
    await expect(startApiRun(f.orgId, token.id, { ...runBody(f), targetRevisionId: other.revisionId }, `foreign-${randomUUID()}`, { limit: allow })).rejects.toMatchObject({ status: 404 });
    const imported = randomUUID();
    await owner.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) SELECT $1,org_id,target_id,$2,$3 FROM evals.target_revision WHERE id=$4",
      [imported, "b".repeat(64), { schema_version: "1.0", kind: "imported_responses", target_revision_id: imported }, f.revisionId]);
    await expect(startApiRun(f.orgId, token.id, { ...runBody(f), targetRevisionId: imported }, `imported-${randomUUID()}`, { limit: allow })).rejects.toMatchObject({ status: 422 });
  }, 90_000);

  it("gates a run on the test set's threshold, the schedule's when it has one, and says unknown or pending otherwise", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    const f = await seed();
    const token = await ciToken(f);
    const run = await startApiRun(f.orgId, token.id, runBody(f), `gate-${randomUUID()}`, { limit: allow });
    expect(await runGate(f.orgId, run.run_id)).toMatchObject({ status: "pending", reason_codes: ["run_in_progress"], threshold: null, threshold_source: null });
    await execute(f, run.run_id);
    await decide(f, run.run_id, { "Management fee": "pass", "Custody fee": "pass", Instalments: "fail" });
    // No threshold yet: unknown, with the score.
    expect(await runGate(f.orgId, run.run_id)).toMatchObject({ status: "unknown", reason_codes: ["threshold_not_set"], score: { pass: 2, scored: 3, percent: 66.7 } });
    expect(await saveSuiteGateThreshold(f.ownerScope, f.suiteId, 60)).toMatchObject({ gate_threshold: 60 });
    expect(await runGate(f.orgId, run.run_id)).toMatchObject({ status: "pass", threshold: 60, threshold_source: "test_set", run_status: "completed" });
    await saveSuiteGateThreshold(f.ownerScope, f.suiteId, 66.67);
    expect(await runGate(f.orgId, run.run_id)).toMatchObject({ status: "fail", reason_codes: ["below_threshold"] });
    expect((await listGateThresholds(f.ownerScope))[0]).toMatchObject({ evaluation_id: f.evaluationId, suite_id: f.suiteId, suite_version_id: f.suiteVersionId, target_revision_id: f.revisionId, gate_threshold: 66.67 });
    await expect(saveSuiteGateThreshold(f.ownerScope, f.suiteId, 100.5)).rejects.toThrow();
    // Before any run selects a system version, the release gate lists the newest one of the evaluation's system.
    await owner.query("UPDATE evals.evaluation SET selected_target_revision_id=NULL WHERE id=$1", [f.evaluationId]);
    expect((await listGateThresholds(f.ownerScope))[0].target_revision_id).toBe(f.revisionId);
    // Thresholds on schedules need the flag; they win over the test set's for the schedule's runs and keep the schedule's version.
    setEnv({ INTEGRATIONS_V2_ENABLED: "false" });
    const scheduleInput = { evaluationId: f.evaluationId, targetRevisionId: f.revisionId, suiteVersionId: f.suiteVersionId, timezone: "Europe/Madrid", cadence: "monthly", localTime: "09:00", weekday: null, dayOfMonth: 1, maxRunSpend: "10", currency: "EUR", sourceMaxAgeDays: null };
    await expect(createSchedule(f.ownerScope, { ...scheduleInput, gateThreshold: 50 }, `s-${randomUUID()}`)).rejects.toMatchObject({ status: 422 });
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    const schedule = await createSchedule(f.ownerScope, { ...scheduleInput, gateThreshold: 50 }, `s-${randomUUID()}`);
    expect(schedule.gateThreshold).toBe(50);
    expect(await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, gateThreshold: 70 })).toMatchObject({ version: schedule.version, gate_threshold: 70 });
    expect((await listSchedules(f.ownerScope)).find(row => row.id === schedule.id)).toMatchObject({ gate_threshold: 70 });
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at='2026-05-01T07:00:00Z' WHERE id=$1", [schedule.id]);
    await tickSchedules(f.system, "2026-05-01T08:00:00.000Z");
    const dispatched = (await owner.query("SELECT run_id FROM evals.schedule_dispatch WHERE schedule_id=$1", [schedule.id])).rows[0].run_id;
    await execute(f, dispatched);
    await decide(f, dispatched, { Instalments: "fail" });
    expect(await runGate(f.orgId, dispatched)).toMatchObject({ status: "fail", threshold: 70, threshold_source: "schedule" });
    // Two of three is 66.666…%: the schedule's 50 % passes it, the test set's 66.67 % does not.
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, gateThreshold: 50 });
    expect(await runGate(f.orgId, dispatched)).toMatchObject({ status: "pass", threshold: 50, threshold_source: "schedule", score: { pass: 2, scored: 3 } });
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, gateThreshold: null });
    expect(await runGate(f.orgId, dispatched)).toMatchObject({ status: "fail", threshold: 66.67, threshold_source: "test_set" });
    expect(await count("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action='gate.threshold_saved'", [f.orgId])).toBe(6);
    // A failed run is unknown; another workspace's run is not found.
    await owner.query("UPDATE evals.run SET status='failed' WHERE id=$1", [run.run_id]);
    expect(await runGate(f.orgId, run.run_id)).toMatchObject({ status: "unknown", reason_codes: ["run_failed"], score: null });
    const other = await seed();
    await expect(runGate(other.orgId, run.run_id)).rejects.toMatchObject({ status: 404 });
  }, 120_000);

  it("creates Slack, Teams and email destinations behind the flag, with egress checks and encrypted credentials; tests and deletes them", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "false" });
    const f = await seed();
    await expect(createWebhookEndpoint(f.ownerScope, { type: "slack", label: "#ai", url: SLACK, events: ["regression"] }, { lookup: publicDns })).rejects.toMatchObject({ status: 422 });
    // The generic webhook works as before with the flag off (no `type`).
    const legacy = await createWebhookEndpoint(f.ownerScope, { label: "CI", url: "https://hooks.example.com/caudals", events: ["regression"] }, { lookup: publicDns });
    expect(legacy).toMatchObject({ destination_type: "webhook", secret: expect.any(String) });
    setEnv({ INTEGRATIONS_V2_ENABLED: "true" });
    await expect(createWebhookEndpoint(f.ownerScope, { type: "slack", label: "#ai", url: SLACK, events: ["regression"] }, { lookup: privateDns })).rejects.toMatchObject({ status: 422 });
    await expect(createWebhookEndpoint(f.ownerScope, { type: "teams", label: "QA", url: "https://intranet.acme.example/hook?x=1", events: ["regression"] }, { lookup: privateDns })).rejects.toMatchObject({ status: 422 });
    await expect(createWebhookEndpoint(f.ownerScope, { type: "slack", label: "#ai", url: "https://hooks.example.com/services/T0001/B0001/abcdefghijkl", events: ["regression"] }, { lookup: publicDns })).rejects.toMatchObject({ status: 422 });
    await expect(createWebhookEndpoint(f.ownerScope, { type: "email", label: "Stranger", email: "victim@other-company.com", events: ["regression"], locale: "en" })).rejects.toMatchObject({ status: 422 });
    const slack = await createWebhookEndpoint(f.ownerScope, { type: "slack", label: "#ai-quality", url: SLACK, events: ["regression", "run_unknown"], locale: "es" }, { lookup: publicDns });
    const teams = await createWebhookEndpoint(f.ownerScope, { type: "teams", label: "QA", url: TEAMS, events: ["regression"], locale: "en" }, { lookup: publicDns });
    const email = await createWebhookEndpoint(f.ownerScope, { type: "email", label: "Alerts inbox", email: "AI-Alerts@acme-l19.com", events: ["regression", "run_completed", "inconclusive"], locale: "en" });
    expect(slack).toMatchObject({ destination_type: "slack", url: null, target_hint: "hooks.slack.com · …alue", locale: "es" });
    expect(slack).not.toHaveProperty("secret");
    // The credential lives only in the encrypted envelope: never in a column, a list or the audit trail.
    const stored = JSON.stringify((await owner.query("SELECT e.*,sv.envelope FROM evals.webhook_endpoint e JOIN evals.webhook_secret_version sv ON sv.id=e.current_secret_version_id WHERE e.org_id=$1", [f.orgId])).rows);
    const listed = JSON.stringify(await listWebhookEndpoints(f.ownerScope));
    const audited = JSON.stringify((await owner.query("SELECT details FROM evals.audit_event WHERE org_id=$1", [f.orgId])).rows);
    for (const secret of ["l19fixturesecretvalue", "l19teamssecret", "ai-alerts@acme-l19.com"]) for (const text of [stored, listed, audited]) expect(text).not.toContain(secret);
    expect(await count("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action='destination.created'", [f.orgId])).toBe(4);
    await expect(updateWebhookEndpoint(f.ownerScope, slack.id, { rotate: true })).rejects.toMatchObject({ status: 422 });

    // Send test: the example message, to the destination's own URL or address, recorded and audited.
    const posts: Array<{ url: string; body: string; options?: { allowQuery?: boolean } }> = [];
    const sent: EmailMessage[] = [];
    const deps = { keys: loadKeyring(keyFile), limit: allow, env: { ...process.env }, send: async (message: EmailMessage) => { sent.push(message); return { id: "re_1" }; },
      post: async (url: string, body: string, _headers: Record<string, string>, options?: { allowQuery?: boolean }) => { posts.push({ url, body, options }); return 200; } };
    expect(await testWebhookEndpoint(f.ownerScope, slack.id, deps)).toMatchObject({ last_test_status: "delivered", last_test_reason: null });
    expect(posts[0].url).toBe(SLACK);
    const slackBody = JSON.parse(posts[0].body);
    expect(slackBody.blocks[0]).toMatchObject({ type: "header", text: { text: "Mensaje de prueba de Caudals" } });
    expect(await testWebhookEndpoint(f.ownerScope, teams.id, deps)).toMatchObject({ last_test_status: "delivered" });
    expect(posts[1]).toMatchObject({ url: TEAMS_URL, options: { allowQuery: true } });
    expect(JSON.parse(posts[1].body).attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(await testWebhookEndpoint(f.ownerScope, email.id, deps)).toMatchObject({ last_test_status: "delivered" });
    expect(sent.map(message => [message.to, message.subject])).toEqual([["ai-alerts@acme-l19.com", "Test message from Caudals"]]);
    const failing = { ...deps, post: async () => 404 };
    expect(await testWebhookEndpoint(f.ownerScope, slack.id, failing)).toMatchObject({ last_test_status: "failed", last_test_reason: "http_error", last_test_http_status: 404 });
    await expect(testWebhookEndpoint(f.ownerScope, slack.id, { ...deps, limit: async input => ({ allowed: false, limit: input.limit, remaining: 0, retryAfterSeconds: 600, resetAt: 0 }) })).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    await expect(testWebhookEndpoint(f.ownerScope, legacy.id, deps)).rejects.toMatchObject({ status: 422 });
    expect(await count("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action='destination.tested'", [f.orgId])).toBe(4);

    // Delete: gone from the list, never sends again, cannot be re-enabled.
    await deleteWebhookEndpoint(f.ownerScope, teams.id);
    expect((await listWebhookEndpoints(f.ownerScope)).map(row => row.id)).not.toContain(teams.id);
    await expect(updateWebhookEndpoint(f.ownerScope, teams.id, { enabled: true })).rejects.toMatchObject({ status: 404 });
    await expect(testWebhookEndpoint(f.ownerScope, teams.id, deps)).rejects.toMatchObject({ status: 404 });
    await expect(deleteWebhookEndpoint(f.ownerScope, teams.id)).rejects.toMatchObject({ status: 404 });
    await expect(owner.query("UPDATE evals.webhook_endpoint SET enabled=true WHERE id=$1", [teams.id])).rejects.toThrow(/webhook_endpoint_archived_disabled/);
  }, 90_000);

  it("delivers L-18's summary to Slack, Teams and email destinations while the signed webhook stays unchanged", async () => {
    setEnv({ INTEGRATIONS_V2_ENABLED: "true", BRANDED_EMAILS_ENABLED: "true" });
    const f = await seed();
    const slack = await createWebhookEndpoint(f.ownerScope, { type: "slack", label: "#ai", url: SLACK, events: ["regression"], locale: "en" }, { lookup: publicDns });
    const teams = await createWebhookEndpoint(f.ownerScope, { type: "teams", label: "QA", url: TEAMS, events: ["regression", "inconclusive"], locale: "es" }, { lookup: publicDns });
    const email = await createWebhookEndpoint(f.ownerScope, { type: "email", label: "Inbox", email: "alerts@acme-l19.com", events: ["regression"], locale: "en" });
    const webhook = await createWebhookEndpoint(f.ownerScope, { type: "webhook", label: "CI", url: "https://hooks.example.com/caudals", events: ["regression"] }, { lookup: publicDns });
    const scheduleInput = { evaluationId: f.evaluationId, targetRevisionId: f.revisionId, suiteVersionId: f.suiteVersionId, timezone: "Europe/Madrid", cadence: "monthly", localTime: "09:00", weekday: null, dayOfMonth: 1, maxRunSpend: "10", currency: "EUR", sourceMaxAgeDays: null };
    const schedule = await createSchedule(f.ownerScope, scheduleInput, `s-${randomUUID()}`);
    const slot = async (month: string) => {
      await owner.query("UPDATE evals.monitor_schedule SET next_due_at=$2 WHERE id=$1", [schedule.id, `${month}-01T07:00:00Z`]);
      await tickSchedules(f.system, `${month}-01T08:00:00.000Z`);
      return (await owner.query("SELECT id,run_id FROM evals.schedule_dispatch WHERE schedule_id=$1 AND local_slot_key=$2", [schedule.id, `${month}-01T09:00`])).rows[0];
    };
    // First run: inconclusive (no baseline): only Teams takes that event.
    const first = await slot("2026-05");
    await execute(f, first.run_id);
    await decide(f, first.run_id, {});
    await tickScheduledAlerts(f.system);
    const deliveries = async () => (await owner.query("SELECT d.event_kind,e.destination_type,d.payload FROM evals.webhook_delivery d JOIN evals.webhook_endpoint e ON e.id=d.endpoint_id WHERE d.org_id=$1 ORDER BY d.created_at,d.id", [f.orgId])).rows;
    expect((await deliveries()).map(row => [row.destination_type, row.event_kind])).toEqual([["teams", "inconclusive"]]);
    // Second run regresses: one delivery each to Slack, Teams, email and the webhook.
    const second = await slot("2026-06");
    await execute(f, second.run_id);
    await decide(f, second.run_id, { "Management fee": "fail" });
    await tickScheduledAlerts(f.system);
    await tickScheduledAlerts(f.system);
    const queued = (await deliveries()).filter(row => row.event_kind === "regression");
    expect(queued.map(row => row.destination_type).sort()).toEqual(["email", "slack", "teams", "webhook"]);
    // The signed webhook's body is exactly WP-13's: ids and outcome, no summary.
    const generic = queued.find(row => row.destination_type === "webhook")!.payload;
    expect(Object.keys(generic).sort()).toEqual(["alert_id", "baseline_run_id", "dispatch_id", "event_id", "event_kind", "reason_codes", "run_id", "status"]);
    expect(queued.find(row => row.destination_type === "slack")!.payload.summary).toMatchObject({ status: "regression", newlyBrokenTotal: 1 });

    // The scheduler's tick formats and sends each one.
    const posts: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const sent: EmailMessage[] = [];
    const ticks = { send: async (message: EmailMessage) => { sent.push(message); return { id: "re_2" }; }, post: async (url: string, body: string, headers: Record<string, string>) => { posts.push({ url, body, headers }); return 200; }, env: { ...process.env } };
    const keys = loadKeyring(keyFile);
    while (await tickWebhookDeliveries(f.system, keys, ticks)) { /* until every delivery is sent */ }
    expect(await count("SELECT count(*)::int AS n FROM evals.webhook_delivery WHERE org_id=$1 AND status<>'delivered'", [f.orgId])).toBe(0);
    const slackPost = posts.find(post => post.url === SLACK && post.body.includes("got worse"))!;
    const slackBody = JSON.parse(slackPost.body);
    expect(slackBody.text).toBe("Support assistant: 1 question got worse since the last run");
    // Links open the evaluation (this fixture's runs have no report; with one they open it and each answer).
    expect(JSON.stringify(slackBody.blocks)).toContain(`<https://app.caudals.test/workspace/evaluations/${f.evaluationId}?orgId=${f.orgId}|Management fee>`);
    expect(slackPost.headers).toEqual({});
    const teamsBodies = posts.filter(post => post.url === TEAMS_URL).map(post => JSON.parse(post.body).attachments[0].content.body[0].text);
    expect(teamsBodies).toEqual(["Support assistant: la ejecución programada ha terminado", "Support assistant: 1 pregunta ha empeorado desde la última ejecución"]);
    const signed = posts.find(post => post.url === "https://hooks.example.com/caudals")!;
    expect(Object.keys(signed.headers).sort()).toEqual(["x-caudals-delivery-id", "x-caudals-signature", "x-caudals-timestamp"]);
    expect(JSON.parse(signed.body)).not.toHaveProperty("summary");
    expect(sent.map(message => [message.to, message.subject])).toEqual([["alerts@acme-l19.com", "Support assistant: 1 question got worse since the last run"]]);
    expect(sent[0].idempotencyKey).toMatch(/^destination:/);
    expect(sent[0].text).toContain("Management fee");

    // With the flag off, new summaries are not queued for Slack, Teams or email (the webhook keeps working).
    setEnv({ INTEGRATIONS_V2_ENABLED: "false" });
    const third = await slot("2026-07");
    await execute(f, third.run_id);
    await decide(f, third.run_id, { "Management fee": "fail", "Custody fee": "fail" });
    await tickScheduledAlerts(f.system);
    const latest = (await owner.query(`SELECT e.destination_type FROM evals.webhook_delivery d JOIN evals.webhook_endpoint e ON e.id=d.endpoint_id
      WHERE d.org_id=$1 AND d.event_id LIKE $2`, [f.orgId, `monitor:${third.id}:%`])).rows.map(row => row.destination_type);
    expect(latest).toEqual(["webhook"]);
    expect([slack.id, teams.id, email.id, webhook.id]).toHaveLength(4);
  }, 180_000);
});
