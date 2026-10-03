import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { storeLoginSession } from "../../lib/evals/repositories/browser-sessions";
import { persistTaughtRecipe, websiteControlTarget } from "../../lib/evals/repositories/web-app-connectors";
import { createPrefixedId } from "../../lib/operator/ids";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createEvaluation } from "../../lib/evals/repositories/managed";
import { controlRun, createSelfServiceRun, getWorkspaceSummary } from "../../lib/evals/repositories/stage-c";
import { assertRunCapacity } from "../../lib/evals/repositories/run-capacity";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
describe.skipIf(!ownerUrl || !runtimeUrl)("taught connectors use the production schema and tenant runtime", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });
  it("saves an encrypted draft, freezes probe evidence, restores metadata without secret SELECT and denies another tenant", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const directory = mkdtempSync(join(tmpdir(), "webapp-keys-"));
    const file = join(directory, "keys.json");
    writeFileSync(file, JSON.stringify({ b1: randomBytes(32).toString("base64") }), { mode: 0o600 });
    process.env.EVALS_BROWSER_SESSION_KEYRING_FILE = file;
    const orgId = randomUUID(), targetId = randomUUID(), projectId = randomUUID(), actorId = createPrefixedId("au"), revisionId = randomUUID();
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "website", endpoint: "https://app.example.test/help", recipe_revision_id: null, login_session_id: null, limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60_000, repetitions: 1 }, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN"); await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Web app fixture", `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Web app fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Web app')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Web app')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
      await db.query("INSERT INTO evals.authorization_record(org_id,project_id,target_id,basis,scope,traffic_limit,expires_at) VALUES($1,$2,$3,'workspace_member_attestation',$4,'{}',now()+interval '1 day')", [orgId, projectId, targetId, { endpoint: config.endpoint }]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const scope = { orgId, actorId };
    const recipe = withContentHash({ schema_version: "1.0", recipe_revision_id: randomUUID(), source: "operator_authored", start_url: config.endpoint, launcher: null, frame_chain: [], input: { kind: "test_id", value: "prompt", frames: [] }, submit: { kind: "click", locator: { kind: "test_id", value: "send", frames: [] } }, message_container: { kind: "role", role: "log", name: null }, assistant_message: { kind: "css", value: ".assistant-message", frames: [] }, completion: { kind: "send_enabled", locator: { kind: "test_id", value: "send", frames: [] } }, reset: { kind: "new_context" }, assistant_extraction: "last_new_message", created_at: new Date().toISOString(), extensions: {} });
    try {
      const state = { cookies: [{ name: "auth", value: "fixture-private-cookie", domain: "app.example.test", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [], session_storage: [{ origin: "https://app.example.test", entries: [{ name: "token", value: "fixture-session-storage" }] }] };
      await storeLoginSession(scope, targetId, { storageState: state, expiresInHours: 24 });
      expect(await persistTaughtRecipe(scope, targetId, recipe)).toMatchObject({ status: "needs_operator" });
      const draft = await websiteControlTarget(scope, targetId);
      expect(draft.loginSessionId).toBeTruthy(); expect(draft.recipe.recipe_revision_id).toBe(recipe.recipe_revision_id);
      expect(JSON.stringify(draft)).not.toContain("fixture-private-cookie");
      const evidence = { checked_at: new Date().toISOString(), messages: [{ prompt_hash: "a".repeat(64), response_hash: "b".repeat(64) }, { prompt_hash: "c".repeat(64), response_hash: "d".repeat(64) }], distinct_responses: true, reset_verified: true, streaming_complete: true, duplicate_free: true, screenshot_artifact_id: null, trace_artifact_id: null };
      expect(await persistTaughtRecipe(scope, targetId, recipe, evidence)).toMatchObject({ status: "ready" });
      // The API stores login state before persisting a retried result.
      await storeLoginSession(scope, targetId, { storageState: state, expiresInHours: 24 });
      expect(await persistTaughtRecipe(scope, targetId, recipe, evidence)).toMatchObject({ status: "ready" });
      const ready = await websiteControlTarget(scope, targetId);
      expect(ready.config.recipe_revision_id).toBe(recipe.recipe_revision_id);
      const checks = await withTenant(scope, client => client.query("SELECT status FROM evals.connection_check WHERE org_id=$1 AND target_revision_id=$2", [orgId, ready.config.target_revision_id]));
      expect(checks.rows[0].status).toBe("ready");
      // Saving an untested draft later keeps the verified connection usable.
      const { content_hash: _hash, ...base } = recipe;
      const draftRecipe = withContentHash({ ...base, recipe_revision_id: randomUUID(), input: { kind: "test_id", value: "prompt-2", frames: [] } });
      await storeLoginSession(scope, targetId, { storageState: state, expiresInHours: 24 });
      expect(await persistTaughtRecipe(scope, targetId, draftRecipe)).toMatchObject({ status: "needs_operator" });
      const kept = await websiteControlTarget(scope, targetId);
      expect(kept.config.recipe_revision_id).toBe(recipe.recipe_revision_id);
      expect(kept.recipe.recipe_revision_id).toBe(draftRecipe.recipe_revision_id);
      const latest = await withTenant(scope, client => client.query("SELECT status FROM evals.connection_check WHERE org_id=$1 AND target_revision_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [orgId, kept.config.target_revision_id]));
      expect(latest.rows[0].status).toBe("ready");

      // Another evaluation reuses the same system, with its own project and
      // sources. A subsequent login refresh must be selected for the new run.
      const secondProject = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID();
      await owner.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Separate evaluation sources')", [secondProject, orgId]);
      const second = await createEvaluation(scope, { projectId: secondProject, targetId, title: "Reuses the web app", evidencePolicy: "source_grounded", commercialCap: "10", currency: "EUR" }, randomUUID());
      expect(second.selected_target_revision_id).toBe(kept.config.target_revision_id);
      await expect(createEvaluation({ ...scope, orgId: randomUUID() }, { projectId: secondProject, targetId, title: "Denied", evidencePolicy: "source_grounded", commercialCap: "10", currency: "EUR" }, randomUUID())).rejects.toMatchObject({ status: 404 });
      const refreshed = await storeLoginSession(scope, targetId, { storageState: state, startUrl: "https://app.example.test/help" });
      expect((await websiteControlTarget(scope, targetId)).config.login_start_url).toBe("https://app.example.test/help");
      const fixture = syntheticAccountingFixture(actorId), item = fixture.cases[0];
      await owner.query("INSERT INTO evals.workspace_entitlement(org_id,max_active_runs,monthly_spend_limit,currency,allowed_connection_types) VALUES($1,1,500,'EUR',ARRAY['website']) ON CONFLICT(org_id) DO UPDATE SET max_active_runs=1,monthly_spend_limit=500,allowed_connection_types=ARRAY['website']", [orgId]);
      await owner.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [fixture.rubric.revision_id, orgId, secondProject, fixture.rubric.content_hash, fixture.rubric]);
      await owner.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, secondProject]);
      await owner.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, fixture.rubric.revision_id]);
      await owner.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Own tests')", [suiteId, orgId, secondProject]);
      const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [],
        case_revisions: [{ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split }], source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
      await owner.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      await owner.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgId, suiteVersionId, item.revision_id]);
      await owner.query("UPDATE evals.evaluation SET preparation_status='ready',selected_suite_version_id=$2 WHERE id=$1", [second.id, suiteVersionId]);
      const summary = await getWorkspaceSummary(scope);
      expect(summary.evaluations.find(evaluation => evaluation.id === second.id)?.selected_target_id).toBe(targetId);
      const firstRun = await createSelfServiceRun(scope, { evaluationId: second.id }, randomUUID());
      const frozen = (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [firstRun.id])).rows[0];
      expect(frozen.target_revision_id).toBe(refreshed.targetRevisionId);
      expect(firstRun.queued).toBe(1);
      await controlRun(scope, firstRun.id, "pause");
      await owner.query("UPDATE evals.run SET status='paused' WHERE id=$1", [firstRun.id]);
      await withTenant(scope, db => assertRunCapacity(db, orgId));
      // A draining invocation keeps its slot even while the run says paused.
      await owner.query("UPDATE evals.case_unit SET status='running' WHERE run_id=$1", [firstRun.id]);
      await expect(withTenant(scope, db => assertRunCapacity(db, orgId))).rejects.toMatchObject({ status: 409 });
      await owner.query("UPDATE evals.case_unit SET status='queued' WHERE run_id=$1", [firstRun.id]);
      const anotherRun = await createSelfServiceRun(scope, { evaluationId: second.id }, randomUUID());
      await expect(controlRun(scope, firstRun.id, "resume")).rejects.toMatchObject({ status: 409 });
      await controlRun(scope, anotherRun.id, "cancel");
      await controlRun(scope, firstRun.id, "resume");
      expect((await owner.query("SELECT status FROM evals.run WHERE id=$1", [firstRun.id])).rows[0].status).toBe("queued");
      // The original plan's login binding is immutable after another save.
      await storeLoginSession(scope, targetId, { storageState: state });
      expect((await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [firstRun.id])).rows[0].target_revision_id).toBe(refreshed.targetRevisionId);
      await expect(websiteControlTarget({ ...scope, orgId: randomUUID() }, targetId)).rejects.toMatchObject({ status: 404 });
      await expect(withTenant(scope, client => client.query("SELECT envelope FROM evals.secret_version WHERE org_id=$1", [orgId]))).rejects.toThrow(/permission denied/);
      await owner.query("UPDATE evals.browser_login_session SET expires_at=now()-interval '1 minute' WHERE org_id=$1", [orgId]);
      expect((await websiteControlTarget(scope, targetId)).sessionExpired).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
