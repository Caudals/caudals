import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getPostgresPool } from "@/lib/db/client";
import { insertRun } from "@/lib/demo/store";
import { requestSignup } from "@/lib/evals/signup";
import { getEvalsPool } from "@/lib/evals/repositories/db";
import { createPrefixedId } from "@/lib/operator/ids";
import { syntheticAccountingFixture } from "@/lib/evals/generation/packs";
import { withContentHash } from "@/lib/evals/contracts/hashing";
import { startAutomaticGeneration } from "@/lib/evals/repositories/automatic-generation";
import {
  advanceOnboardingAutostarts, getFirstEvaluation, getWorkspaceOnboarding, onboardingDueWorkspaces,
  requestOnboardingHelp, resolveOnboardingHelp, updateWorkspaceOnboarding,
} from "@/lib/evals/repositories/onboarding";
import { getGrowth } from "@/lib/analytics/growth";
import { notifyOperatorsOfHelp } from "@/lib/evals/onboarding/help-email";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

// No email leaves: sign-up links and the ops notice go to a stand-in. The
// limiter is covered by the routes' own tests. The demo import is real.
const mail = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text: string }, _options?: unknown) => ({ data: { id: "fake" }, error: null })));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: mail } }) }));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0, resetAt: Date.now() + 1000 })),
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const headers = { "content-type": "application/json", host: "localhost", origin: "http://localhost" };

/** Migration 086 on the disposable database: launch L-06 first-run onboarding. */
describe.skipIf(!ownerUrl || !runtimeUrl)("first-run onboarding (migration 086)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let operator: EvalIdentity;
  beforeAll(async () => {
    Object.assign(process.env, {
      EVALS_DATABASE_URL: runtimeUrl, DATABASE_URL: runtimeUrl, RESEND_FROM_EMAIL: "signup@example.test",
      SIGNUP_TERMS_REQUIRED: "true", ANALYTICS_EVENTS_V2: "true", ONBOARDING_AUTOSTART: "true",
      COLLABORATION_NOTIFICATION_EMAIL: "ops@caudals.example",
    });
    const id = createPrefixedId("au");
    await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,'Fixture operator',$2,true)`, [id, `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [id]);
    operator = { user: { id, name: "Fixture", email: "operator@example.test" }, platformRole: "operator", workspaces: [] };
  });
  beforeEach(() => { process.env.ONBOARDING_AUTOSTART = "true"; mail.mockClear(); });
  afterAll(async () => {
    for (const key of ["ONBOARDING_AUTOSTART", "SIGNUP_TERMS_REQUIRED", "ANALYTICS_EVENTS_V2", "COLLABORATION_NOTIFICATION_EMAIL"]) delete process.env[key];
    await owner.end();
    await getEvalsPool().end();
    await getPostgresPool().end();
  });

  const complete = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/evals/v1/signup/route");
    return POST(new Request("http://localhost/api/evals/v1/signup", { method: "POST", headers, body: JSON.stringify(body) }));
  };

  /** A finished website demo, its emailed link, and the real sign-up route (which imports the demo). */
  async function demoSignup() {
    const host = `shop-${randomUUID().slice(0, 8)}.example`;
    const runId = await insertRun({ tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "a"), locale: "es", spec: { kind: "website", url: `https://${host}/chat` }, targetHost: host, docsUrl: `https://${host}/ayuda`, docsHost: host, clientHash: "b".repeat(64), auth: false });
    await owner.query("UPDATE demo.run SET phase='done',finished_at=now(),summary=$2::jsonb WHERE id=$1", [runId, JSON.stringify({ scored: 8, correct: 5 })]);
    const email = `owner@${host}`;
    await requestSignup({ email, runId, host, locale: "es" });
    const token = /signup#([A-Za-z0-9_-]{43})/.exec(mail.mock.calls.at(-1)![0].text)![1];
    const response = await complete({ token, name: "Ana Pérez", password: "a-long-password-1", acceptTerms: true, locale: "es" });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.evaluationId).toEqual(expect.any(String));
    const actorId = (await owner.query("SELECT created_by FROM evals.workspace WHERE id=$1", [data.orgId])).rows[0].created_by as string;
    await routes(data.orgId, actorId);
    return { orgId: data.orgId as string, evaluationId: data.evaluationId as string, actorId, token, scope: { orgId: data.orgId as string, actorId } };
  }

  /** Generation models for the workspace (production uses the platform defaults). */
  async function routes(orgId: string, actorId: string) {
    const account = randomUUID(), revision = randomUUID(), price = randomUUID();
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'Fixture','EUR',100,true)", [account]);
    // An explicit free model: the €0 guard (migration 088) refuses unpriced paid models on customer routes.
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,concurrency_limit,rpm,tpm,free_model)
      VALUES($1,$2,'openai_compatible','https://example.test/v1','fixture',$3,$4,'{"text":true,"boundedTokens":true,"jsonObject":true}',32000,4096,ARRAY['customer_confidential'],ARRAY['private_wireguard'],1,10,100000,true)`, [revision, account, actorId, ["context_analyzer", "generator", "judge", "report_writer"]]);
    await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [price, revision]);
    await owner.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,created_by) VALUES($1,'openai_compatible','https://example.test/v1',$2)", [account, actorId]);
    for (const role of ["context_analyzer", "generator"])
      await owner.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'customer_confidential','private_wireguard',0,$5)", [orgId, role, revision, price, actorId]);
  }

  /** The documents worker finishing the site: an extracted revision for the website source. */
  async function siteRead(orgId: string, actorId: string) {
    const client = await owner.connect();
    try {
      // Artifact and revision triggers read the tenant context, as on the worker's own connection.
      await client.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)", [actorId, orgId]);
      const job = (await client.query("SELECT w.id,w.source_id,s.project_id FROM evals.website_source_job w JOIN evals.source s ON (s.org_id,s.id)=(w.org_id,w.source_id) WHERE w.org_id=$1", [orgId])).rows[0];
      const { source } = syntheticAccountingFixture(actorId);
      const { content_hash: _hash, ...rest } = source;
      const revisionId = randomUUID(), artifactId = randomUUID();
      const document = withContentHash({ ...rest, source_id: job.source_id, revision_id: revisionId });
      await client.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'text/markdown','ready',now()+interval '1 day')",
        [artifactId, orgId, job.project_id, `sources/website-${job.source_id}-${revisionId}.md`, `fixture/${artifactId}`, source.artifact.sha256, source.artifact.size_bytes]);
      await client.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'fixture')", [revisionId, orgId, job.source_id, artifactId, document.content_hash, document]);
      await client.query("UPDATE evals.website_source_job SET status='completed',artifact_id=$2,source_revision_id=$3,updated_at=now() WHERE id=$1", [job.id, artifactId, revisionId]);
      return revisionId;
    } finally {
      await client.query("RESET evals.actor_id; RESET evals.org_id").catch(() => {});
      client.release();
    }
  }
  const check = (orgId: string, status: string, code: string | null) =>
    owner.query("UPDATE evals.connection_check SET status=$2,error_code=$3,completed_at=now() WHERE org_id=$1", [orgId, status, code]);
  const jobs = async (orgId: string) => (await owner.query("SELECT id,requested_case_count,start_input,created_by FROM evals.generation_job WHERE org_id=$1", [orgId])).rows;
  const intent = async (orgId: string) => (await owner.query("SELECT status,reason_code,generation_job_id,max_cases,page_limit,locale FROM evals.onboarding_autostart WHERE org_id=$1", [orgId])).rows[0];

  it("sign-up → import → exactly one generation job at the plan limit, even when every caller retries at once", async () => {
    const f = await demoSignup();
    // Right after sign-up: the intent waits for the site, nothing spends model time yet.
    expect(await intent(f.orgId)).toMatchObject({ status: "waiting", reason_code: "reading_site", page_limit: 25, locale: "es", generation_job_id: null });
    expect((await owner.query("SELECT page_limit,status FROM evals.website_source_job WHERE org_id=$1", [f.orgId])).rows[0]).toEqual({ page_limit: 25, status: "queued" });
    expect((await owner.query("SELECT status FROM evals.connection_check WHERE org_id=$1", [f.orgId])).rows[0].status).toBe("queued");
    expect(await jobs(f.orgId)).toHaveLength(0);

    // The check could not automate the chat (the common case) and the site is read: preparation may start.
    await check(f.orgId, "needs_operator", "recipe_not_found");
    await siteRead(f.orgId, f.actorId);
    const scheduler = { orgId: f.orgId, actorId: "service:evals-scheduler" };
    expect(await onboardingDueWorkspaces("service:evals-scheduler")).toContain(f.orgId);
    const started = await Promise.all([
      advanceOnboardingAutostarts(f.scope), advanceOnboardingAutostarts(scheduler), advanceOnboardingAutostarts(scheduler, f.evaluationId),
      getFirstEvaluation(f.scope, f.evaluationId).then(() => 0),
    ]);
    expect(started.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(1);
    const created = await jobs(f.orgId);
    expect(created).toHaveLength(1);
    // Free plan: 50 tests per set. The job belongs to the person who signed up.
    expect(created[0]).toMatchObject({ requested_case_count: 50, created_by: f.actorId });
    expect(created[0].start_input).toMatchObject({ maxCases: 50, complexity: "balanced", executionMode: "deployed_system", locale: "es", promptRevision: "dgx-context-cases-v5" });
    expect(await intent(f.orgId)).toMatchObject({ status: "started", reason_code: null, generation_job_id: created[0].id, max_cases: 50 });
    expect((await owner.query("SELECT actor_id FROM evals.audit_event WHERE org_id=$1 AND action='evaluation.autostart'", [f.orgId])).rows).toEqual([{ actor_id: f.actorId }]);

    // Retried: the scheduler, the page and a replayed sign-up change nothing.
    expect(await advanceOnboardingAutostarts(scheduler)).toBe(0);
    expect(await onboardingDueWorkspaces("service:evals-scheduler")).not.toContain(f.orgId);
    expect((await complete({ token: f.token, name: "Ana", password: "a-long-password-1", acceptTerms: true })).status).toBe(404);
    expect(await jobs(f.orgId)).toHaveLength(1);
    const state = await getFirstEvaluation(f.scope, f.evaluationId);
    expect(state).toMatchObject({ enabled: true, autostart: { status: "started", pageLimit: 25, maxCases: 50 }, connection: { state: "attention", code: "recipe_not_found", kind: "website" }, site: { state: "ready" }, generation: { status: "profiling", target: 50 } });
  }, 60000);

  it("waits for the site, blocks while the chat is unreachable and starts once it is fixed", async () => {
    const f = await demoSignup();
    await check(f.orgId, "needs_operator", "destination_denied");
    await advanceOnboardingAutostarts(f.scope);
    expect(await intent(f.orgId)).toMatchObject({ status: "blocked", reason_code: "chat_unreachable" });
    await siteRead(f.orgId, f.actorId);
    await advanceOnboardingAutostarts(f.scope);
    expect(await intent(f.orgId)).toMatchObject({ status: "blocked", reason_code: "chat_unreachable" });
    expect(await jobs(f.orgId)).toHaveLength(0);
    const state = await getFirstEvaluation(f.scope, f.evaluationId);
    expect(state.connection).toMatchObject({ state: "unreachable", code: "destination_denied" });

    // A new check passes (the customer fixed the address): the next tick starts preparation.
    const revision = (await owner.query("SELECT target_revision_id FROM evals.connection_check WHERE org_id=$1", [f.orgId])).rows[0].target_revision_id;
    await owner.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,probe_evidence,completed_at,created_at) VALUES($1,$2,'ready','{}',now(),now()+interval '1 second')", [f.orgId, revision]);
    expect(await advanceOnboardingAutostarts({ orgId: f.orgId, actorId: "service:evals-scheduler" })).toBe(1);
    expect(await jobs(f.orgId)).toHaveLength(1);
  }, 60000);

  it("blocks on an unreadable site and lets a manual start take over without a second job", async () => {
    const f = await demoSignup();
    await check(f.orgId, "ready", null);
    await owner.query("UPDATE evals.website_source_job SET status='failed',reason_code='website_capture_unavailable' WHERE org_id=$1", [f.orgId]);
    await advanceOnboardingAutostarts(f.scope);
    expect(await intent(f.orgId)).toMatchObject({ status: "blocked", reason_code: "site_unreadable" });
    expect((await getFirstEvaluation(f.scope, f.evaluationId)).site).toMatchObject({ state: "failed", code: "website_capture_unavailable" });

    // The customer adds pages and presses Generate themselves.
    const revisionId = await siteRead(f.orgId, f.actorId);
    await startAutomaticGeneration(f.scope, f.evaluationId, { sourceRevisionIds: [revisionId], title: "Manual", executionMode: "deployed_system", promptRevision: "fixture", maxCases: 10 }, randomUUID());
    await advanceOnboardingAutostarts(f.scope);
    expect(await intent(f.orgId)).toMatchObject({ status: "superseded", reason_code: "manual_start", generation_job_id: null });
    expect(await jobs(f.orgId)).toHaveLength(1);
  }, 60000);

  it("does nothing while ONBOARDING_AUTOSTART is off", async () => {
    process.env.ONBOARDING_AUTOSTART = "false";
    const host = `off-${randomUUID().slice(0, 8)}.example`;
    const runId = await insertRun({ tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "c"), locale: "en", spec: { kind: "website", url: `https://${host}/chat` }, targetHost: host, docsUrl: `https://${host}/help`, docsHost: host, clientHash: "b".repeat(64), auth: false });
    await owner.query("UPDATE demo.run SET phase='done',finished_at=now() WHERE id=$1", [runId]);
    await requestSignup({ email: `owner@${host}`, runId, host, locale: "en" });
    const token = /signup#([A-Za-z0-9_-]{43})/.exec(mail.mock.calls.at(-1)![0].text)![1];
    const { data } = await (await complete({ token, name: "Off", password: "a-long-password-1", acceptTerms: true })).json();
    expect(data.evaluationId).toEqual(expect.any(String));
    expect((await owner.query("SELECT 1 FROM evals.onboarding_autostart WHERE org_id=$1 UNION ALL SELECT 1 FROM evals.workspace_onboarding WHERE org_id=$1", [data.orgId])).rowCount).toBe(0);
    expect(await onboardingDueWorkspaces("service:evals-scheduler")).toEqual([]);
    const actorId = (await owner.query("SELECT created_by FROM evals.workspace WHERE id=$1", [data.orgId])).rows[0].created_by;
    expect(await getFirstEvaluation({ orgId: data.orgId, actorId }, data.evaluationId)).toMatchObject({ enabled: false, autostart: null });
  }, 60000);

  it("computes the checklist from real state, stores the welcome on the workspace and shows it to operators", async () => {
    const f = await demoSignup();
    let state = await getWorkspaceOnboarding(f.scope);
    expect(state).toMatchObject({ enabled: true, tracked: true, dismissed: false, complete: false, welcome: { pending: true, systemType: null, goal: null }, firstEvaluationId: f.evaluationId });
    expect(state.steps).toEqual({ connect: false, sources: false, run: false, results: false, invite: false });

    await siteRead(f.orgId, f.actorId);
    await check(f.orgId, "ready", null);
    await owner.query("INSERT INTO evals.invitation(org_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,'viewer',$3,now()+interval '7 days',$4)", [f.orgId, `colleague@${randomUUID().slice(0, 6)}.example`, randomUUID().replaceAll("-", "").padEnd(64, "0"), f.actorId]);
    state = await getWorkspaceOnboarding(f.scope);
    expect(state.steps).toEqual({ connect: true, sources: true, run: false, results: false, invite: true });

    // Welcome answers: owner only; stored on the workspace; visible in the growth view.
    state = await updateWorkspaceOnboarding(f.scope, { action: "answer", systemType: "website_chat", goal: "pre_launch" });
    expect(state.welcome).toEqual({ pending: false, systemType: "website_chat", goal: "pre_launch" });
    const growth = await getGrowth(operator);
    expect(growth.accounts.find((row) => row.orgId === f.orgId)).toMatchObject({ systemType: "website_chat", goal: "pre_launch" });
    expect(growth.activation?.length).toBe(8);

    // A viewer can neither dismiss nor answer; the owner can dismiss, and it is audited.
    const viewer = createPrefixedId("au");
    await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,'Viewer',$2,true)`, [viewer, `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [f.orgId, viewer]);
    await expect(updateWorkspaceOnboarding({ orgId: f.orgId, actorId: viewer }, { action: "dismiss" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(updateWorkspaceOnboarding({ orgId: f.orgId, actorId: viewer }, { action: "skip" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    expect((await getWorkspaceOnboarding({ orgId: f.orgId, actorId: viewer })).dismissed).toBe(false);
    expect((await updateWorkspaceOnboarding(f.scope, { action: "dismiss" })).dismissed).toBe(true);
    expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'workspace.onboarding_%' ORDER BY created_at", [f.orgId])).rows.map((row) => row.action)).toEqual(["workspace.onboarding_answer", "workspace.onboarding_dismiss"]);

    // Members of another workspace see nothing; the runtime role cannot write the table directly.
    const other = await demoSignup();
    await expect(getWorkspaceOnboarding({ orgId: f.orgId, actorId: other.actorId })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
    try {
      await expect(runtime.query("INSERT INTO evals.workspace_onboarding(org_id) VALUES($1)", [randomUUID()])).rejects.toThrow(/permission denied/);
      await expect(runtime.query("UPDATE evals.workspace_onboarding SET goal='pre_launch'")).rejects.toThrow(/permission denied/);
    } finally {
      await runtime.end();
    }
  }, 90000);

  it("opens one help request per evaluation, emails the operators once and lets only operators resolve it", async () => {
    const f = await demoSignup();
    await check(f.orgId, "failed", "connection_check_failed");
    await advanceOnboardingAutostarts(f.scope);
    const first = await requestOnboardingHelp(f.scope, f.evaluationId, "chat_unreachable");
    const again = await requestOnboardingHelp(f.scope, f.evaluationId, "chat_unreachable");
    expect(first).toMatchObject({ created: true, notified: false });
    expect(again).toMatchObject({ id: first.id, created: false });
    await notifyOperatorsOfHelp({ requestId: first.id, orgId: f.orgId, evaluationId: f.evaluationId, workspace: first.workspace, evaluation: first.evaluation, reason: "chat_unreachable" });
    const [message, options] = mail.mock.calls.at(-1)!;
    expect(message.to).toBe("ops@caudals.example");
    expect(message.text).toContain(`/workspace/evaluations/${f.evaluationId}?orgId=${f.orgId}`);
    expect(message.text).not.toMatch(/owner@|a-long-password/);
    expect(options).toEqual({ idempotencyKey: `onboarding-help-${first.id}` });
    expect((await getFirstEvaluation(f.scope, f.evaluationId)).help).toMatchObject({ id: first.id, status: "open" });

    await expect(resolveOnboardingHelp(f.actorId, first.id)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    expect(await resolveOnboardingHelp(operator.user.id, first.id)).toBe(true);
    expect(await resolveOnboardingHelp(operator.user.id, first.id)).toBe(false);
    const growth = await getGrowth(operator);
    expect(growth.help?.find((row) => row.id === first.id)).toMatchObject({ status: "resolved", reason: "chat_unreachable" });
    expect((await requestOnboardingHelp(f.scope, f.evaluationId, "chat_unreachable")).id).not.toBe(first.id);
    expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'workspace.help_%' ORDER BY created_at", [f.orgId])).rows.map((row) => row.action))
      .toEqual(["workspace.help_requested", "workspace.help_resolved", "workspace.help_requested"]);
  }, 60000);

  it("stores the example evaluation's hide choice per workspace, for owners and operators only, in any workspace", async () => {
    // A workspace that did not come through self-serve sign-up (an ops-created pilot).
    const ownerId = createPrefixedId("au"), viewer = createPrefixedId("au"), orgId = randomUUID();
    for (const [id, name] of [[ownerId, "Pilot owner"], [viewer, "Pilot viewer"]]) await owner.query(`INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)`, [id, name, `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Pilot',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", [orgId, ownerId, viewer]);
    const scope = { orgId, actorId: ownerId };
    expect(await getWorkspaceOnboarding(scope)).toMatchObject({ tracked: false, exampleHidden: false, welcome: { pending: false } });
    await expect(updateWorkspaceOnboarding({ orgId, actorId: viewer }, { action: "hide_example" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const hidden = await updateWorkspaceOnboarding(scope, { action: "hide_example" });
    // Hiding creates the row without turning the pilot into an onboarding workspace.
    expect(hidden).toMatchObject({ tracked: false, dismissed: false, exampleHidden: true, welcome: { pending: false } });
    expect((await getWorkspaceOnboarding({ orgId, actorId: viewer })).exampleHidden).toBe(true);
    // Checklist and welcome changes stay limited to tracked workspaces.
    expect((await updateWorkspaceOnboarding(scope, { action: "dismiss" })).dismissed).toBe(false);
    expect((await updateWorkspaceOnboarding(scope, { action: "show_example" })).exampleHidden).toBe(false);
    expect((await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'workspace.example_%' ORDER BY created_at", [orgId])).rows.map((row) => row.action))
      .toEqual(["workspace.example_hidden", "workspace.example_shown"]);

    // In a self-serve workspace the same choice keeps its checklist and welcome.
    const f = await demoSignup();
    const state = await updateWorkspaceOnboarding(f.scope, { action: "hide_example" });
    expect(state).toMatchObject({ tracked: true, exampleHidden: true, welcome: { pending: true } });
  }, 60000);

  it("the rollback refuses while onboarding rows exist", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/086_evals_onboarding_down.sql", import.meta.url), "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/Rollback blocked: \d+ onboarding rows exist/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.onboarding_autostart') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });

  it("the rollback removes everything once no rows exist (checked in a transaction, then undone)", async () => {
    const sql = (await readFile(new URL("../../db/rollbacks/086_evals_onboarding_down.sql", import.meta.url), "utf8")).replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM evals.onboarding_help_request; DELETE FROM evals.onboarding_autostart; DELETE FROM evals.workspace_onboarding;");
      await client.query(sql);
      expect((await client.query("SELECT to_regclass('evals.workspace_onboarding') AS t, to_regprocedure('evals.workspace_onboarding_state(uuid)') AS f")).rows[0]).toEqual({ t: null, f: null });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.workspace_onboarding') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
