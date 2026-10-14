/**
 * Bring your own provider key on the production schema (launch L-27,
 * migration 102, spec v2 §6.11, D-11, INV-11).
 *
 * Isolation: a workspace key is decrypted only by the inference worker, only
 * for its own workspace's reserved calls; no route, export, role or log ever
 * returns it. Routing: runs freeze the workspace route to the key's revision,
 * and a failing key pauses the work (never a Caudals key). Billing: calls on
 * the key carry no token credits; platform fees are still charged. The key
 * check with the provider is replaced by a fake (its own suite is
 * byok.test.ts); everything else is the real code on scripts/evals/test-db.sh.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import type { KeyCheck } from "@/lib/evals/providers/byok";
import { createPrefixedId } from "@/lib/operator/ids";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const fake = vi.hoisted(() => ({ identity: null as EvalIdentity | null, keys: new Map<string, KeyCheck>() }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => fake.identity!,
}));
// The provider's key check: known keys pass with their state and models, any other key is rejected.
vi.mock("@/lib/evals/providers/byok", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evals/providers/byok")>();
  return {
    ...actual,
    checkProviderKey: async (_provider: string, key: string) => {
      const known = fake.keys.get(key);
      if (!known) throw new actual.KeyCheckFailed("rejected", 401);
      return known;
    },
  };
});

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const WORKER = "service:evals-worker";
const MODEL = "openai/gpt-6-luna";
/** Synthetic key-shaped strings, one per use; never real credentials. */
const newKey = (prefix = "sk-or-v1-") => `${prefix}${randomBytes(24).toString("hex")}`;
const allKeys: string[] = [];
function key(state: KeyCheck["state"] = "valid", prefix?: string) {
  const value = newKey(prefix);
  allKeys.push(value);
  fake.keys.set(value, { state, models: [MODEL, "anthropic/claude-sonnet-5-5"] });
  return value;
}
/** The key or any recognisable part of it. */
const fragments = (value: string) => [value, value.slice(0, 16), value.slice(-12), value.slice(9, 25)];
function expectNoKey(text: string) {
  for (const value of allKeys) for (const part of fragments(value)) expect(text.includes(part), "a key fragment leaked").toBe(false);
}

describe.skipIf(!ownerUrl || !runtimeUrl)("bring your own provider key on PostgreSQL (L-27)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  const rolePool = (role: string) => {
    const pool = new Pool({ connectionString: ownerUrl, max: 6 });
    pool.on("connect", (client) => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const workerPool = rolePool("evals_worker"), adminPool = rolePool("evals_execution_admin"), schedulerPool = rolePool("evals_scheduler");
  const logged: string[] = [];
  let keyring: ReadonlyMap<string, Buffer>;
  let mods: Awaited<ReturnType<typeof load>>;
  async function load() {
    return {
      byok: await import("@/lib/evals/repositories/byok"),
      managed: await import("@/lib/evals/repositories/managed"),
      judging: await import("@/lib/evals/repositories/judging"),
      db: await import("@/lib/evals/repositories/db"),
      worker: await import("@/lib/evals/queue/worker"),
      contracts: await import("@/lib/evals/providers/contracts"),
      envelope: await import("@/lib/evals/security/envelope"),
      secrets: await import("@/lib/evals/security/secrets"),
      ledger: await import("@/lib/billing/ledger"),
      units: await import("@/lib/billing/units"),
      estimate: await import("@/lib/billing/estimate"),
      lifecycle: await import("@/lib/evals/operations/lifecycle"),
      byokRoute: await import("@/app/api/evals/v1/engine/byok/route"),
      byokKeyRoute: await import("@/app/api/evals/v1/engine/byok/[id]/route"),
      byokRoutesRoute: await import("@/app/api/evals/v1/engine/byok/routes/route"),
    };
  }

  beforeAll(async () => {
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ")); });
    }
    const dir = mkdtempSync(path.join(tmpdir(), "byok-keyring-"));
    const file = path.join(dir, "keyring.json");
    writeFileSync(file, JSON.stringify({ v1: randomBytes(32).toString("base64") }), { mode: 0o600 });
    vi.stubEnv("EVALS_MASTER_KEYRING_FILE", file);
    vi.stubEnv("EVALS_MASTER_KEY_VERSION", "v1");
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    mods = await load();
    keyring = mods.envelope.loadKeyring(file);
  });
  afterAll(async () => {
    // Nothing any code path logged in this file carries a key or part of one.
    expectNoKey(logged.join("\n"));
    vi.unstubAllEnvs();
    delete process.env.BILLING_CREDITS_ENABLED; delete process.env.BILLING_ENFORCE; delete process.env.BYOK_WORKSPACE_IDS; delete process.env.BYOK_ENABLED;
    await Promise.all([owner.end(), runtime.end(), workerPool.end(), adminPool.end(), schedulerPool.end(), mods.db.getEvalsPool().end()]);
  });

  /* ------------------------------------------------------------ fixtures --- */

  type Workspace = Awaited<ReturnType<typeof workspace>>;
  /** A workspace (managed by default) with an imported-answers run, an owner and BYOK opened for it. */
  async function workspace(plan: "managed" | "payg" | "free" = "managed") {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    if (plan !== "managed") await owner.query("UPDATE evals.workspace_entitlement SET plan=$2 WHERE org_id=$1", [f.orgId, plan]);
    const ownerId = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [ownerId, "BYOK owner", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [f.orgId, ownerId]);
    const ids = new Set((process.env.BYOK_WORKSPACE_IDS ?? "").split(",").filter(Boolean));
    ids.add(f.orgId);
    process.env.BYOK_WORKSPACE_IDS = [...ids].join(",");
    const as = (role: "owner" | "editor" = "owner", recent = true, userId = ownerId): EvalIdentity => ({
      user: { id: userId, email: `${userId}@example.test`, name: role },
      platformRole: null,
      workspaces: [{ id: f.orgId, name: "BYOK fixture", role }],
      sessionCreatedAt: new Date(Date.now() - (recent ? 60_000 : 60 * 60_000)).toISOString(),
      mfa: { enabled: false, required: false },
    });
    return { ...f, ownerId, as };
  }
  /** Connect a key and run the judge and report writer on it. */
  async function onKey(f: Workspace, apiKey = key()) {
    const settings = await mods.byok.connectByokKey(f.as(), f.orgId, { provider: "openrouter", apiKey });
    const connection = settings.connections.find((item) => !item.revokedAt && item.provider === "openrouter")!;
    const routed = await mods.byok.setByokRoute(f.as(), f.orgId, { connectionId: connection.id, modelId: MODEL, roles: ["judge", "report_writer"] });
    const revisionId = (await owner.query("SELECT id FROM evals.provider_revision WHERE account_id=$1", [connection.id])).rows[0].id as string;
    return { apiKey, connection, settings: routed, revisionId };
  }
  /** A new imported-answers run with both answers applied: it freezes the routes in effect now. */
  const targetOf = async (f: Workspace) => (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [f.run.id])).rows[0].target_revision_id as string;
  async function newRun(f: Workspace) {
    const run = await mods.managed.createRun(f.scope, { evaluationId: f.evaluationId, targetRevisionId: await targetOf(f),
      suiteVersionId: f.suiteVersionId, executionMode: "imported_responses", plan: { purpose: "BYOK fixture" } }, randomUUID());
    const mapping = { suite_version_id: "suite_version_id", case_id: "case_id", case_revision_id: "case_revision_id", input: "input", system_answer: "system_answer" };
    const csv = "suite_version_id,case_id,case_revision_id,input,system_answer\n" + f.cases.map((item) =>
      [f.suiteVersionId, item.case_id, item.revision_id, "Question", `A 10% service fee applies (${run.id}).`].join(",")).join("\n") + "\n";
    const imported = await mods.managed.persistImport(f.scope, { projectId: f.projectId, intent: "manual_answers", format: "csv", mapping, suiteVersionId: f.suiteVersionId, bytes: Buffer.from(csv) }, randomUUID());
    await mods.managed.applyMatchedAnswers(f.scope, imported.id, run.id);
    return run;
  }
  /** The judge steps queued for a run, as worker jobs. */
  async function judgeJobs(f: Workspace, runId: string) {
    const rows = (await owner.query(`SELECT s.id,s.input_hash FROM evals.judge_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id)
      WHERE j.org_id=$1 AND j.run_id=$2 ORDER BY s.created_at,s.id`, [f.orgId, runId])).rows;
    return rows.map((row) => ({ orgId: f.orgId, stepId: row.id as string, inputHash: row.input_hash as string }));
  }
  type Invoke = NonNullable<ConstructorParameters<typeof mods.worker.InvocationWorker>[0]["invoke"]>;
  /** The real inference worker with a fake model: it records every key it was handed. */
  function engine(behaviour: "answer" | "quota" | "rejected" = "answer", mode: "off" | "shadow" | "enforce" = "off") {
    const seen: Array<{ revisionId: string; org: string | null; secret: string | null }> = [];
    const invoke: Invoke = async (provider, _call, secret) => {
      seen.push({ revisionId: provider.id, org: provider.org_id ?? null, secret: secret ? secret.toString("utf8") : null });
      if (behaviour === "quota") throw new mods.contracts.ProviderFailure("quota_exceeded", "rejected", 0, "Key limit exceeded");
      if (behaviour === "rejected") throw new mods.contracts.ProviderFailure("invalid_credentials", "rejected", 0, "Invalid API key");
      return { text: JSON.stringify({ criteria: [] }), complete: true, finishReason: "stop", latencyMs: 5, usage: { input: 300, output: 40, cached: 0 } };
    };
    const worker = new mods.worker.InvocationWorker({ tx: (tenant, fn) => mods.db.withTenant(tenant, fn, workerPool), keys: keyring, actorId: WORKER, workerId: randomUUID(), invoke, leaseSeconds: 30, billing: () => mode });
    return { seen, handle: (job: { orgId: string; stepId: string; inputHash: string }) => worker.handle(job) };
  }
  /** Put a paused step and its workflow back in the queue, as a resume would. */
  const requeue = async (stepId: string) => {
    await owner.query("UPDATE evals.workflow_step SET status='queued',reason_code=NULL WHERE id=$1", [stepId]);
    await owner.query("UPDATE evals.execution_workflow SET status='queued',reason_code=NULL WHERE id=(SELECT workflow_id FROM evals.workflow_step WHERE id=$1)", [stepId]);
  };
  const step = async (id: string) => (await owner.query("SELECT status,reason_code,workflow_id FROM evals.workflow_step WHERE id=$1", [id])).rows[0];
  const connectionRow = async (accountId: string) => (await owner.query("SELECT * FROM evals.provider_connection WHERE account_id=$1", [accountId])).rows[0];
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
  const request = (url: string, method: string, body?: unknown) => new Request(`http://localhost/api/evals/v1${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

  /* ---------------------------------------------------------- isolation --- */

  it("decrypts a key only for its own workspace's calls, through the worker", async () => {
    const a = await workspace(), b = await workspace();
    const keyA = await onKey(a), keyB = await onKey(b);
    expect(keyA.revisionId).not.toBe(keyB.revisionId);
    expectNoKey(JSON.stringify([keyA.settings, keyB.settings]));
    // The connection is workspace-scoped: account, revision and connection carry the workspace.
    expect((await owner.query("SELECT org_id FROM evals.provider_revision WHERE id=$1", [keyA.revisionId])).rows[0].org_id).toBe(a.orgId);
    const rowA = await connectionRow(keyA.connection.id);
    expect(rowA).toMatchObject({ org_id: a.orgId, provider: "openrouter", key_hint: null, check_state: "valid", endpoint: "https://openrouter.ai/api/v1" });
    // No part of the key is stored in clear.
    expectNoKey(JSON.stringify(rowA));

    const runA = await newRun(a), runB = await newRun(b);
    expect((await owner.query("SELECT model_routes->'judge'->>'provider_revision_id' AS id FROM evals.run WHERE id=$1", [runA.id])).rows[0].id).toBe(keyA.revisionId);
    expect((await mods.managed.scoreRun(a.scope, runA.id, "judge-fixture-v1")).judgments).toMatchObject({ queued: 2 });
    expect((await mods.managed.scoreRun(b.scope, runB.id, "judge-fixture-v1")).judgments).toMatchObject({ queued: 2 });
    const workerA = engine(), workerB = engine();
    for (const job of await judgeJobs(a, runA.id)) await workerA.handle(job);
    for (const job of await judgeJobs(b, runB.id)) await workerB.handle(job);
    expect(workerA.seen).toHaveLength(2);
    expect(workerA.seen.every((call) => call.secret === keyA.apiKey && call.org === a.orgId && call.revisionId === keyA.revisionId)).toBe(true);
    expect(workerB.seen.every((call) => call.secret === keyB.apiKey && call.org === b.orgId)).toBe(true);

    // A step in B that names A's revision is refused before any call or reservation.
    const intruder = engine();
    const budget = (await owner.query("SELECT id FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace'", [b.orgId])).rows[0].id;
    const runBudget = (await owner.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,'EUR',1) RETURNING id", [b.orgId, randomUUID()])).rows[0];
    const price = (await owner.query("SELECT id FROM evals.price_revision WHERE provider_revision_id=$1", [keyA.revisionId])).rows[0].id;
    const { enqueueInvocation } = await import("@/lib/evals/queue/store");
    const stolen = await mods.db.withTenant({ orgId: b.orgId, actorId: b.actorId }, (db) => enqueueInvocation(db, { orgId: b.orgId, actorId: b.actorId }, {
      workflowId: randomUUID(), runId: randomUUID(), planHash: "c".repeat(64), kind: "grade", version: 1,
      input: { probe: false, probeKind: "text", outputFormat: "text", providerRevisionId: keyA.revisionId, priceRevisionId: price, workspaceBudgetId: budget, runBudgetId: runBudget.id,
        role: "judge", dataClass: "customer_confidential", region: "external_api", routing: "approved_providers", approvedProviderIds: [keyA.revisionId],
        messages: [{ role: "user", content: "Grade this." }], maxOutputTokens: 64, timeoutMs: 60000, internalCostPerSecond: "0" },
    }));
    await intruder.handle({ orgId: b.orgId, stepId: stolen, inputHash: (await owner.query("SELECT input_hash FROM evals.workflow_step WHERE id=$1", [stolen])).rows[0].input_hash });
    expect(intruder.seen).toHaveLength(0);
    expect(await step(stolen)).toMatchObject({ status: "paused", reason_code: "invocation_configuration_invalid" });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.execution_attempt WHERE step_id=$1", [stolen])).rows[0].n).toBe(0);

    // A route may name the key only from its own workspace, never as the platform default.
    await expect(owner.query(`INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by)
      VALUES($1,'generator',$2,$3,'customer_confidential','external_api',0,'test')`, [b.orgId, keyA.revisionId, price])).rejects.toThrow("BYOK_SCOPE_DENIED");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query(`INSERT INTO evals.platform_model_route(role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by)
        VALUES('generator',$1,$2,'customer_confidential','external_api',0,'test') ON CONFLICT(role) DO UPDATE SET provider_revision_id=excluded.provider_revision_id,price_revision_id=excluded.price_revision_id`,
      [keyA.revisionId, price])).rejects.toThrow("BYOK_SCOPE_DENIED");
    } finally { await client.query("ROLLBACK"); client.release(); }

    // The envelope opens only for its workspace, account and key version.
    const open = (orgId: string, accountId: string, version: string) => mods.envelope.decryptSecret(rowA.envelope, mods.secrets.customerKeySecretScope(orgId, accountId, version), keyring);
    expect(open(a.orgId, keyA.connection.id, rowA.key_version).toString("utf8")).toBe(keyA.apiKey);
    const rowB = await connectionRow(keyB.connection.id);
    expect(() => open(b.orgId, keyB.connection.id, rowB.key_version)).toThrow("secret_unavailable");
    expect(() => open(b.orgId, keyA.connection.id, rowA.key_version)).toThrow("secret_unavailable");
    expect(() => open(a.orgId, keyA.connection.id, randomUUID())).toThrow("secret_unavailable");
  });

  it("keeps the table away from the web runtime and the admin login, and B's worker away from A's key", async () => {
    const a = await workspace(), b = await workspace();
    const keyA = await onKey(a);
    // The web runtime has no grant on the table at all.
    const db = await runtime.connect();
    try {
      await expect(db.query("SELECT account_id FROM evals.provider_connection LIMIT 1")).rejects.toThrow(/permission denied/);
      await expect(db.query("SELECT evals.byok_report($1,'valid')", [keyA.connection.id])).rejects.toThrow(/permission denied/);
    } finally { db.release(); }
    // Settings → AI models for platform admins sees Caudals' own providers only.
    const admin = await adminPool.connect();
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('evals.org_id',$1,true)", [a.orgId]);
      expect((await admin.query("SELECT count(*)::int AS n FROM evals.provider_connection WHERE org_id IS NOT NULL")).rows[0].n).toBe(0);
      await expect(admin.query("UPDATE evals.provider_connection SET envelope=NULL WHERE account_id=$1 RETURNING 1", [keyA.connection.id])).resolves.toMatchObject({ rowCount: 0 });
    } finally { await admin.query("ROLLBACK"); admin.release(); }
    // The worker in B's scope cannot see A's connection; in A's scope it can.
    const visible = (orgId: string) => mods.db.withTenant({ orgId, actorId: WORKER }, async (c) =>
      (await c.query("SELECT count(*)::int AS n FROM evals.provider_connection WHERE account_id=$1", [keyA.connection.id])).rows[0].n, workerPool);
    expect(await visible(b.orgId)).toBe(0);
    expect(await visible(a.orgId)).toBe(1);
    // Only owners use the definer functions; a member of another workspace is refused.
    await expect(mods.db.withTenant({ orgId: a.orgId, actorId: b.ownerId }, (c) => c.query("SELECT * FROM evals.byok_connections($1)", [a.orgId]))).rejects.toThrow("BYOK_OWNER_REQUIRED");
    await expect(mods.db.withTenant({ orgId: b.orgId, actorId: b.ownerId }, (c) => c.query("SELECT * FROM evals.byok_connections($1)", [a.orgId]))).rejects.toThrow("BYOK_SCOPE_DENIED");
  });

  it("never returns the key through any route, and stores no part of it", async () => {
    const f = await workspace();
    fake.identity = f.as();
    const first = key(), replacement = key(), second = key("valid", "sk-proj-");
    const texts: string[] = [];
    const json = async (response: Response) => { const text = await response.text(); texts.push(text); return { status: response.status, body: JSON.parse(text) }; };
    expect((await json(await mods.byokRoute.GET(request(`/engine/byok?orgId=${f.orgId}`, "GET")))).status).toBe(200);
    const created = await json(await mods.byokRoute.POST(request("/engine/byok", "POST", { orgId: f.orgId, provider: "openrouter", apiKey: first })));
    expect(created.status).toBe(200);
    const id = created.body.data.connections[0].id as string;
    expect((await json(await mods.byokRoute.POST(request("/engine/byok", "POST", { orgId: f.orgId, provider: "openai", apiKey: second })))).status).toBe(200);
    // A rejected key, a duplicate and a malformed one: errors never repeat it either.
    const rejected = key(); fake.keys.delete(rejected);
    expect(await json(await mods.byokRoute.POST(request("/engine/byok", "POST", { orgId: f.orgId, provider: "mistral", apiKey: rejected })))).toMatchObject({ status: 422, body: { error: { code: "BYOK_KEY_REJECTED" } } });
    expect(await json(await mods.byokRoute.POST(request("/engine/byok", "POST", { orgId: f.orgId, provider: "openrouter", apiKey: first })))).toMatchObject({ status: 409 });
    expect((await json(await mods.byokRoute.POST(request("/engine/byok", "POST", { orgId: f.orgId, provider: "google", apiKey: `${first} with spaces` })))).status).toBe(400);
    expect((await json(await mods.byokKeyRoute.PATCH(request(`/engine/byok/${id}`, "PATCH", { orgId: f.orgId, apiKey: replacement })))).status).toBe(200);
    expect((await json(await mods.byokRoutesRoute.PUT(request("/engine/byok/routes", "PUT", { orgId: f.orgId, connectionId: id, modelId: MODEL })))).body.data.routes).toHaveLength(4);
    expect(await json(await mods.byokRoutesRoute.PUT(request("/engine/byok/routes", "PUT", { orgId: f.orgId, connectionId: id, modelId: "not-listed" })))).toMatchObject({ status: 422 });
    expect((await json(await mods.byokRoutesRoute.DELETE(request(`/engine/byok/routes?orgId=${f.orgId}&role=judge`, "DELETE")))).body.data.routes).toHaveLength(3);
    expect((await json(await mods.byokRoute.GET(request(`/engine/byok?orgId=${f.orgId}`, "GET")))).body.data.connections).toHaveLength(2);
    const removed = await json(await mods.byokKeyRoute.DELETE(request(`/engine/byok/${id}?orgId=${f.orgId}`, "DELETE")));
    expect(removed.body.data).toMatchObject({ routesRemoved: 3 });
    expect(removed.body.data.routes).toHaveLength(0);
    expectNoKey(texts.join("\n"));
    // Removed: the envelope is erased; replaced: the old version can never open again.
    const row = await connectionRow(id);
    expect(row).toMatchObject({ envelope: null, revoked_by: f.ownerId });
    expect(row.revoked_at).not.toBeNull();
    // The audit trail names actions, never key material.
    const audit = (await owner.query("SELECT action,details FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'byok.%' ORDER BY created_at", [f.orgId])).rows;
    expect(audit.map((item) => item.action)).toEqual(["byok.key.connected", "byok.key.connected", "byok.key.rotated", "byok.route.set", "byok.route.cleared", "byok.key.revoked"]);
    expectNoKey(JSON.stringify(audit));
    // Every row this workspace's keys touched is free of key material.
    expectNoKey(JSON.stringify((await owner.query("SELECT * FROM evals.provider_connection WHERE org_id=$1", [f.orgId])).rows));
    fake.identity = null;
  });

  /* ---------------------------------------------------------- gating --- */

  it("is for owners of paid workspaces, behind the flag, with a recent sign-in to add or replace a key", async () => {
    const free = await workspace("free");
    await expect(mods.byok.connectByokKey(free.as(), free.orgId, { provider: "openai", apiKey: key() })).rejects.toMatchObject({ code: "BYOK_PLAN_REQUIRED", status: 403 });
    expect(await mods.byok.getByokSettings(free.as(), free.orgId)).toMatchObject({ available: false, plan: "free", connections: [] });
    // The database refuses too, whatever the caller.
    await expect(mods.db.withTenant({ orgId: free.orgId, actorId: free.ownerId }, (c) => c.query("SELECT evals.byok_connect($1,$2,'openai','{}'::jsonb,$3,'valid','[]'::jsonb)", [free.orgId, randomUUID(), randomUUID()]))).rejects.toThrow("BYOK_PLAN_REQUIRED");

    const f = await workspace("payg");
    const editor = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [editor, "Editor", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'editor')", [f.orgId, editor]);
    await expect(mods.byok.getByokSettings(f.as("editor", true, editor), f.orgId)).rejects.toMatchObject({ status: 404 });
    await expect(mods.byok.connectByokKey(f.as("owner", false), f.orgId, { provider: "openai", apiKey: key() })).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    const { connection } = await onKey(f);

    // Flag off: no new keys, but the owner still sees and can remove the one they have.
    process.env.BYOK_WORKSPACE_IDS = (process.env.BYOK_WORKSPACE_IDS ?? "").split(",").filter((id) => id !== f.orgId && id !== free.orgId).join(",");
    await expect(mods.byok.getByokSettings(free.as(), free.orgId)).rejects.toMatchObject({ status: 404 });
    expect(await mods.byok.getByokSettings(f.as(), f.orgId)).toMatchObject({ available: false });
    await expect(mods.byok.connectByokKey(f.as(), f.orgId, { provider: "openai", apiKey: key() })).rejects.toMatchObject({ status: 404 });
    // Removing needs neither the flag nor a recent sign-in.
    expect((await mods.byok.revokeByokKey(f.as("owner", false), f.orgId, connection.id)).routesRemoved).toBe(2);
    await expect(mods.byok.getByokSettings(f.as(), f.orgId)).rejects.toMatchObject({ status: 404 });
  });

  /* ---------------------------------------------------------- routing --- */

  it("pauses work on a failing key, never falls back to a Caudals key, and resumes after a working key is saved", async () => {
    const f = await workspace();
    const { apiKey, connection, revisionId } = await onKey(f);
    const run = await newRun(f);
    await mods.managed.scoreRun(f.scope, run.id, "judge-fixture-v1");
    const jobs = await judgeJobs(f, run.id);
    const failing = engine("quota");
    for (const job of jobs) await failing.handle(job);
    // One call, on the workspace's own key and revision; the second step paused with the workflow, unclaimed.
    expect(failing.seen.map((call) => ({ ...call, secret: call.secret === apiKey }))).toEqual([{ revisionId, org: f.orgId, secret: true }]);
    for (const job of jobs) expect(await step(job.stepId)).toMatchObject({ status: "paused", reason_code: "customer_key_quota" });
    expect((await owner.query("SELECT status,reason_code FROM evals.execution_workflow WHERE id=$1", [(await step(jobs[0].stepId)).workflow_id])).rows[0])
      .toMatchObject({ status: "paused", reason_code: "customer_key_quota" });
    // Grading waits (never graded by another model), and the run says why.
    await mods.judging.advanceJudgments(f.scope, run.id);
    expect((await owner.query("SELECT DISTINCT status FROM evals.judge_job WHERE run_id=$1", [run.id])).rows).toEqual([{ status: "queued" }]);
    expect((await mods.managed.getRun(f.scope, run.id)).grading).toMatchObject({ queued: 2, blocked: "customer_key_quota" });
    expect((await connectionRow(connection.id)).check_state).toBe("quota_exceeded");
    // The run's frozen routes still name the key: nothing was swapped.
    expect((await owner.query("SELECT model_routes->'judge'->>'provider_revision_id' AS id FROM evals.run WHERE id=$1", [run.id])).rows[0].id).toBe(revisionId);

    // A replaced (working) key resumes the paused work by itself; calls use the new key.
    const fresh = key();
    const rotated = await mods.byok.rotateByokKey(f.as(), f.orgId, connection.id, { apiKey: fresh });
    expect(rotated.connections[0]).toMatchObject({ state: "valid" });
    for (const job of jobs) expect((await step(job.stepId)).status).toBe("queued");
    const working = engine();
    for (const job of jobs) await working.handle(job);
    expect(working.seen).toHaveLength(2);
    expect(working.seen.every((call) => call.secret === fresh), "calls use the replaced key").toBe(true);
    for (const job of jobs) expect((await step(job.stepId)).status).toBe("completed");
    expect((await mods.managed.getRun(f.scope, run.id)).grading.blocked).toBeNull();

    // A rejected key is remembered, and later calls stop before reaching the provider.
    const run2 = await newRun(f);
    await mods.managed.scoreRun(f.scope, run2.id, "judge-fixture-v1");
    const [first, second] = await judgeJobs(f, run2.id);
    const rejecting = engine("rejected");
    await rejecting.handle(first);
    expect(await step(first.stepId)).toMatchObject({ status: "paused", reason_code: "customer_key_invalid" });
    expect((await connectionRow(connection.id)).check_state).toBe("invalid");
    await requeue(second.stepId);
    await rejecting.handle(second);
    expect(rejecting.seen).toHaveLength(1);
    expect(await step(second.stepId)).toMatchObject({ status: "paused", reason_code: "customer_key_invalid" });

    // Removing the key: work paused on it says so, and its grading ends ungraded (never another model).
    await mods.byok.revokeByokKey(f.as(), f.orgId, connection.id);
    expect(await step(second.stepId)).toMatchObject({ status: "paused", reason_code: "customer_key_revoked" });
    expect((await owner.query("SELECT reason_code FROM evals.execution_workflow WHERE id=$1", [(await step(second.stepId)).workflow_id])).rows[0].reason_code).toBe("customer_key_revoked");
    expect((await mods.managed.getRun(f.scope, run2.id)).grading.blocked).toBe("customer_key_revoked");
    await mods.judging.advanceJudgments(f.scope, run2.id);
    expect((await owner.query("SELECT DISTINCT status,reason_code FROM evals.judge_job WHERE run_id=$1", [run2.id])).rows).toEqual([{ status: "failed", reason_code: "customer_key_revoked" }]);
    // A queued call frozen on the removed key stops at the claim, again without any call.
    await requeue(second.stepId);
    const after = engine();
    await after.handle(second);
    expect(after.seen).toHaveLength(0);
    expect(await step(second.stepId)).toMatchObject({ status: "paused", reason_code: "customer_key_revoked" });
    // The workspace routes to the key are gone: new work uses Caudals' models because the owner chose so.
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.generation_provider_route r JOIN evals.provider_revision p ON p.id=r.provider_revision_id WHERE r.org_id=$1 AND p.org_id IS NOT NULL", [f.orgId])).rows[0].n).toBe(0);
  });

  it("records the data routing in the report methodology", async () => {
    const f = await workspace();
    // The fixture's first run froze the private DGX routes.
    await mods.managed.scoreRun(f.scope, f.run.id, "customer-manual-deterministic-v1");
    const local = await mods.managed.createReportForRun(f.scope, { runId: f.run.id, title: "Local", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    const { apiKey } = await onKey(f);
    const run = await newRun(f);
    await mods.managed.scoreRun(f.scope, run.id, "customer-manual-deterministic-v1");
    const own = await mods.managed.createReportForRun(f.scope, { runId: run.id, title: "Own key", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
    const snapshot = async (id: string) => (await owner.query("SELECT snapshot FROM evals.report_revision WHERE id=$1", [id])).rows[0].snapshot;
    expect((await snapshot(local.revisionId)).methodology.data_routing).toBe("local_only");
    const ownSnapshot = await snapshot(own.revisionId);
    expect(ownSnapshot.methodology.data_routing).toBe("customer_provider");
    expect(JSON.stringify(ownSnapshot)).not.toContain(apiKey);
  });

  /* ---------------------------------------------------------- billing --- */

  it("charges no token credits on the key (enforce and shadow) while platform fees are charged", async () => {
    const c = (credits: number) => mods.units.creditsToUcr(credits);
    for (const mode of ["enforce", "shadow"] as const) {
      process.env.BILLING_CREDITS_ENABLED = "true";
      process.env.BILLING_ENFORCE = mode;
      const f = await workspace("payg");
      await mods.db.withTenant({ orgId: f.orgId, actorId: "service:evals-scheduler" }, (db) =>
        mods.ledger.grantCredits(db, { orgId: f.orgId, key: `grant-${randomUUID()}`, amountUcr: c(100), source: "grant" }), schedulerPool);
      const { revisionId } = await onKey(f);
      // The price book's view: a workspace key is free of token credits.
      const pricing = await mods.db.withTenant({ orgId: f.orgId, actorId: WORKER }, async (db) =>
        (await db.query("SELECT free_model,rate_id FROM billing.engine_pricing($1,$2,300)", [f.orgId, revisionId])).rows[0], workerPool);
      expect(pricing).toEqual({ free_model: true, rate_id: null });
      const run = await newRun(f);
      await mods.managed.scoreRun(f.scope, run.id, "judge-fixture-v1");
      const worker = engine("answer", mode);
      for (const job of await judgeJobs(f, run.id)) await worker.handle(job);
      expect(worker.seen).toHaveLength(2);
      const attempts = (await owner.query("SELECT id FROM evals.execution_attempt WHERE org_id=$1 AND provider_revision_id=$2 AND status='completed'", [f.orgId, revisionId])).rows.map((row) => row.id);
      expect(attempts).toHaveLength(2);
      const holds = (await owner.query("SELECT count(*)::int AS n FROM billing.credit_hold WHERE org_id=$1 AND attempt_id=ANY($2::uuid[])", [f.orgId, attempts])).rows[0].n;
      const shadowEngine = (await owner.query("SELECT count(*)::int AS n FROM billing.shadow_entry WHERE org_id=$1 AND kind IN ('hold','capture','release') AND attempt_id=ANY($2::uuid[])", [f.orgId, attempts])).rows[0].n;
      const captures = (await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type IN ('hold','capture')", [f.orgId])).rows[0].n;
      expect({ mode, holds, shadowEngine, captures }).toEqual({ mode, holds: 0, shadowEngine: 0, captures: 0 });
      // Our euro liability for these calls is 0 as well.
      expect((await owner.query("SELECT coalesce(sum(actual),0)::text AS spent FROM evals.budget_reservation WHERE org_id=$1 AND attempt_id=ANY($2::uuid[])", [f.orgId, attempts])).rows[0].spent).toMatch(/^0(\.0+)?$/);
      // Graded imported answers keep their platform fee.
      const fees = mode === "enforce"
        ? (await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='action' AND meter='graded_answer' AND run_id=$2", [f.orgId, run.id])).rows[0].n
        : (await owner.query("SELECT count(*)::int AS n FROM billing.shadow_entry WHERE org_id=$1 AND kind='action' AND meter='graded_answer' AND run_id=$2", [f.orgId, run.id])).rows[0].n;
      expect({ mode, fees }).toEqual({ mode, fees: 2 });
      // The estimate shows the key and no token credits for its roles.
      const targetRevisionId = await targetOf(f);
      const estimate = await mods.db.withTenant({ orgId: f.orgId, actorId: f.ownerId }, (db) =>
        mods.estimate.estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId }));
      expect(estimate.models.judge).toMatchObject({ free: true, customerKey: true });
    }
    delete process.env.BILLING_CREDITS_ENABLED;
    delete process.env.BILLING_ENFORCE;
  });

  /* ---------------------------------------------------------- deletion --- */

  it("erases the workspace's keys when the workspace is deleted", async () => {
    const f = await workspace();
    const { connection } = await onKey(f);
    await mods.lifecycle.requestWorkspaceDeletion({ orgId: f.orgId, actorId: f.ownerId }, "Customer asked us to delete all evaluation data");
    expect(await connectionRow(connection.id)).toMatchObject({ envelope: null });
    expect((await connectionRow(connection.id)).revoked_at).not.toBeNull();
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.generation_provider_route WHERE org_id=$1 AND provider_revision_id IN (SELECT id FROM evals.provider_revision WHERE account_id=$2)", [f.orgId, connection.id])).rows[0].n).toBe(0);
    // Without an open deletion request nobody may call it.
    const other = await workspace();
    await expect(mods.db.withTenant({ orgId: other.orgId, actorId: other.ownerId }, (c) => c.query("SELECT evals.byok_revoke_for_deletion($1)", [other.orgId]))).rejects.toThrow("BYOK_SCOPE_DENIED");
  });
});
