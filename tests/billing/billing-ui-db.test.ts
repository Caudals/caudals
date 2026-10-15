/**
 * The customer billing screens on the production schema (launch L-15, spec v2
 * §6.7, §6.9, §6.10, §6.12, §6.16): who sees billing (BILLING_UI_ENABLED and
 * the workspace's eligibility), the role checks of /billing/{summary,usage,
 * ledger,caps,rates} (owner, editor, viewer, platform admin), every number
 * against the ledger, spend caps and the auto-recharge cover at admission, the
 * scheduler's billing watch (cap pauses, alerts once, notices by role) and the
 * resume after credits arrive. Stripe is never called; the database is
 * scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { captureCredits, chargeAction, grantCredits, holdCredits, refundRun, releaseCredits, verifyAccounts } from "../../lib/billing/ledger";
import { billingCaps, billingLedger, billingRates, billingSummary, billingUsage, saveBillingCaps, usageCsv } from "../../lib/billing/customer-api";
import { usageLines, usageReport } from "../../lib/billing/account-view";
import { assertWithinCaps, autoRechargeCover, readSpendCaps } from "../../lib/billing/limits";
import { runBillingWatch } from "../../lib/billing/watch";
import { resumeAfterCredits } from "../../lib/billing/settlement";
import { setAutoRecharge, saveStripeCustomer } from "../../lib/billing/payments";
import { setWorkspaceOverride } from "../../lib/billing/overrides";
import { listNotifications } from "../../lib/evals/repositories/notifications";
import { creditsToUcr, ucrToCredits } from "../../lib/billing/units";
import type { EmailMessage } from "../../lib/evals/operations/notifications";
import { estimateForMember } from "../../lib/billing/api";
import { admitRun } from "../../lib/billing/engine";
import { estimateEvaluationRun } from "../../lib/billing/estimate";
import { importedJudgeRunFixture } from "../evals/judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";
const c = (credits: number | string) => creditsToUcr(credits);
const B = (value: unknown) => BigInt(String(value));
const ENV_KEYS = ["BILLING_UI_ENABLED", "BILLING_CREDITS_ENABLED", "BILLING_ENFORCE", "BILLING_TEST_WORKSPACE_IDS", "PLANS_V2_ENABLED", "BILLING_STRIPE_MODE",
  "STRIPE_SECRET_KEY", "BILLING_ESTIMATES_ENABLED", "COLLABORATION_NOTIFICATION_EMAIL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

describe.skipIf(!ownerUrl || !runtimeUrl)("billing and usage screens on the production schema (L-15)", () => {
  process.env.EVALS_DATABASE_URL = runtimeUrl;
  const owner = new Pool({ connectionString: ownerUrl, max: 6 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 12 });
  afterEach(() => { for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  afterAll(async () => { await Promise.all([owner.end(), runtime.end(), getEvalsPool().end()]); });
  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  const system = (orgId: string) => ({ orgId, actorId: SCHEDULER });

  /** Billing shows for test workspaces in Stripe test mode (the production rollout before Gate B). */
  function open(...orgIds: string[]) {
    process.env.BILLING_UI_ENABLED = "true";
    process.env.BILLING_CREDITS_ENABLED = "true";
    process.env.BILLING_ENFORCE = "shadow";
    process.env.BILLING_STRIPE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.BILLING_TEST_WORKSPACE_IDS = orgIds.join(",");
    delete process.env.PLANS_V2_ENABLED;
  }

  /* ------------------------------------------------------------ fixtures --- */

  async function user(email = `${randomUUID()}@example.test`, platformAdmin = false) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Billing fixture", email]);
    if (platformAdmin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    return { id, email };
  }
  async function as(actorId: string, orgId: string, sql: string, params: unknown[] = [], skipValidation = false) {
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      if (skipValidation) await client.query("SET LOCAL session_replication_role = replica");
      const result = await client.query(sql, params);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  /** A free workspace with an owner (a Caudals address, so test-mode alerts may email it), an editor and a viewer, one evaluation and a DGX model. */
  async function seed() {
    const ownerUser = await user(`billing-${randomUUID().slice(0, 8)}@caudals.com`), editor = await user(), viewer = await user(), admin = await user(undefined, true);
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID();
    const suiteId = randomUUID(), suiteVersionId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Billing fixture',$2)", [orgId, ownerUser.id]);
    for (const [member, role] of [[ownerUser.id, "owner"], [editor.id, "editor"], [viewer.id, "viewer"]] as const) {
      await as(ownerUser.id, orgId, "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, member, role]);
    }
    await as(ownerUser.id, orgId, "UPDATE evals.workspace_entitlement SET plan='free',max_systems=1,max_tests_per_set=50,max_runs_per_month=3 WHERE org_id=$1", [orgId]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Billing fixture')", [projectId, orgId]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Support bot','source_grounded',10,'EUR')", [evaluationId, orgId, projectId]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Support chat')", [targetId, orgId, projectId]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,'{\"kind\":\"website\"}')", [revisionId, orgId, targetId, "a".repeat(64)]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Suite')", [suiteId, orgId, projectId]);
    await as(ownerUser.id, orgId, "INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,'{}')", [suiteVersionId, orgId, suiteId, "b".repeat(64)], true);
    // The engine model: a DGX revision, priced as Caudals Local in the price book.
    const accountId = randomUUID(), providerId = randomUUID(), priceId = randomUUID();
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'billing ui fixture','EUR',100,true)", [accountId]);
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      VALUES($1,$2,'dgx','http://dgx.invalid/v1','fixture-local','fixture',ARRAY['judge','report_writer'],'{"text":true,"boundedTokens":true}',16384,1024,ARRAY['synthetic'],ARRAY['private'],1000,10000000,4)`, [providerId, accountId]);
    await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, providerId]);
    const identity = (id: string, role: "owner" | "editor" | "viewer" | null, platformRole: "platform_admin" | null = null): EvalIdentity =>
      ({ user: { id, name: "Fixture", email: "fixture@example.test" }, platformRole, workspaces: role ? [{ id: orgId, name: "Billing fixture", role }] : [] });
    return {
      orgId, projectId, evaluationId, revisionId, suiteVersionId, providerId, priceId, ownerUser,
      owner: identity(ownerUser.id, "owner"), editor: identity(editor.id, "editor"), viewer: identity(viewer.id, "viewer"), admin: identity(admin.id, null, "platform_admin"),
      ownerScope: { orgId, actorId: ownerUser.id }, editorScope: { orgId, actorId: editor.id }, viewerScope: { orgId, actorId: viewer.id },
    };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;

  /** A run with its execution workflow and one engine step (what a capture's attempt belongs to). */
  async function run(f: Fixture, status: "completed" | "running" | "failed" = "completed") {
    const runId = randomUUID(), workflowId = randomUUID(), stepId = randomUUID(), attemptId = randomUUID();
    await as(f.ownerUser.id, f.orgId, `INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase)
      VALUES($1,$2,$3,$4,$5,'deployed_system',$6,$7)`, [runId, f.orgId, f.evaluationId, f.revisionId, f.suiteVersionId, status, status === "running" ? "target_execution" : "done"]);
    await as(f.ownerUser.id, f.orgId, "INSERT INTO evals.execution_workflow(id,org_id,run_id,status,phase,plan_hash,created_by) VALUES($1,$2,$3,$4,'execute',$5,'fixture')",
      [workflowId, f.orgId, runId, status === "running" ? "running" : status, "c".repeat(64)]);
    await as(f.ownerUser.id, f.orgId, "INSERT INTO evals.workflow_step(id,org_id,workflow_id,step_kind,input_hash,version,input,status) VALUES($1,$2,$3,'grade',$4,1,'{}',$5)",
      [stepId, f.orgId, workflowId, "d".repeat(64), status === "running" ? "queued" : "completed"]);
    await as(f.ownerUser.id, f.orgId, "INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,1,1,$4,$5,'completed',2048)",
      [attemptId, f.orgId, stepId, f.providerId, f.priceId]);
    const revision = (await owner.query("SELECT price_book_revision_id FROM evals.run WHERE id=$1", [runId])).rows[0].price_book_revision_id as string;
    return { runId, workflowId, attemptId, revision };
  }

  const grant = (f: Fixture, credits: number | string, source: "grant" | "allowance" = "grant") =>
    tx(system(f.orgId), db => grantCredits(db, { orgId: f.orgId, key: `fixture-${randomUUID()}`, amountUcr: c(credits), source, reason: "Billing UI fixture" }));
  /** One engine call: hold, then capture (the rest released), as the worker does. */
  const engineCall = (f: Fixture, r: Awaited<ReturnType<typeof run>>, held: number | string, used: number | string) => tx(system(f.orgId), async db => {
    const key = `attempt:${randomUUID()}`;
    await holdCredits(db, { orgId: f.orgId, key, amountUcr: c(held), runId: r.runId, attemptId: r.attemptId, priceBookRevisionId: r.revision });
    return captureCredits(db, { orgId: f.orgId, key, amountUcr: c(used), metadata: { usage: { input: 1200, output: 300, cached: 0 } } });
  });
  const meter = (f: Fixture, runId: string | null, meterName: string, credits: number | string, quantity = 1) => tx(system(f.orgId), db =>
    chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: meterName, amountUcr: c(credits), quantity, runId: runId ?? undefined }));

  /** Usage computed straight from ledger_entry, independently of the code under test. */
  async function ledgerUsage(orgId: string, from = new Date(0), to = new Date("2100-01-01")) {
    const row = (await owner.query(`SELECT
        coalesce(-sum(e.amount_ucr) FILTER (WHERE e.entry_type IN ('capture','action')),0) AS gross,
        coalesce((SELECT sum(r.amount_ucr) FROM billing.ledger_entry r JOIN billing.ledger_entry d ON d.id=r.reverses_entry_id
          WHERE r.org_id=$1 AND d.entry_type IN ('capture','action') AND d.created_at >= $2 AND d.created_at < $3),0) AS returned
      FROM billing.ledger_entry e WHERE e.org_id=$1 AND e.created_at >= $2 AND e.created_at < $3`, [orgId, from, to])).rows[0];
    return { gross: B(row.gross), returned: B(row.returned), net: B(row.gross) - B(row.returned) };
  }
  const account = async (orgId: string) => {
    const row = (await owner.query("SELECT available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
    return { available: B(row.available_ucr), held: B(row.held_ucr) };
  };
  const issues = async (orgId: string) => (await tx(system(orgId), db => verifyAccounts(db, orgId)))[0].issues;

  /* ---------------------------------------------------------------- gating --- */

  it("shows billing only with BILLING_UI_ENABLED and an eligible workspace", async () => {
    const f = await seed();
    await grant(f, 100);
    // Off: nothing to show, for the owner too. The summary answers `null` to a member (the shell
    // asks on every page; a 404 was console noise, R3); the other billing routes stay 404.
    expect(await billingSummary(f.owner, f.orgId)).toBeNull();
    await expect(billingCaps(f.owner, f.orgId)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    // On, but the workspace is neither a test workspace nor allowlisted: nothing.
    open();
    expect(await billingSummary(f.owner, f.orgId)).toBeNull();
    expect(await billingSummary(f.editor, f.orgId)).toBeNull();
    // Credits off: nothing, whatever the UI flag says.
    open(f.orgId);
    process.env.BILLING_CREDITS_ENABLED = "false";
    expect(await billingSummary(f.owner, f.orgId)).toBeNull();
    // A test workspace (Stripe test mode, internal).
    open(f.orgId);
    expect((await billingSummary(f.owner, f.orgId))!.balance.availableUcr).toBe(c(100).toString());
    // An admin override: plans v2 or live payments.
    open();
    const admin = { orgId: f.orgId, actorId: f.admin.user.id };
    await tx(admin, db => setWorkspaceOverride(db, { orgId: f.orgId, enforcement: "inherit", livePayments: false, plansV2: true, reason: "L-15 fixture" }));
    expect((await billingSummary(f.owner, f.orgId))!.plan).toBe("free");
    await tx(admin, db => setWorkspaceOverride(db, { orgId: f.orgId, enforcement: "inherit", livePayments: true, plansV2: false, reason: "L-15 fixture" }));
    expect((await billingSummary(f.editor, f.orgId))!.level).toBe("editor");
    await tx(admin, db => setWorkspaceOverride(db, { orgId: f.orgId, enforcement: "inherit", livePayments: false, plansV2: false, reason: "L-15 fixture" }));
    expect(await billingSummary(f.owner, f.orgId)).toBeNull();
    // Gate B: every workspace.
    process.env.PLANS_V2_ENABLED = "true";
    expect((await billingSummary(f.owner, f.orgId))!.level).toBe("owner");
  });

  /* ----------------------------------------------------------------- roles --- */

  it("answers owners everything, editors the balance and usage, viewers nothing (server-side)", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 250);
    const ownerView = (await billingSummary(f.owner, f.orgId))!;
    expect(ownerView).toMatchObject({ level: "owner", payments: { access: "test_workspace", mode: "test" }, autoRecharge: { enabled: false } });
    const editorView = (await billingSummary(f.editor, f.orgId))!;
    expect(editorView).toMatchObject({ level: "editor", autoRecharge: null, card: null, payments: null, balance: ownerView.balance });
    const params = (orgId: string, extra = "") => new URLSearchParams(`orgId=${orgId}${extra}`);
    expect(await billingUsage(f.editor, params(f.orgId))).toHaveProperty("totals");
    expect(await billingCaps(f.editor, f.orgId)).toMatchObject({ recipients: null });
    expect((await billingCaps(f.owner, f.orgId)).recipients).toEqual([f.ownerUser.email]);
    expect(await billingRates(f.editor, params(f.orgId, `&evaluationId=${f.evaluationId}`))).toHaveProperty("catalog");
    // The ledger is for owners.
    await expect(billingLedger(f.editor, params(f.orgId))).rejects.toMatchObject({ status: 404 });
    expect((await billingLedger(f.owner, params(f.orgId))).entries.length).toBeGreaterThan(0);
    // Viewers: nothing at all.
    for (const call of [() => billingSummary(f.viewer, f.orgId), () => billingUsage(f.viewer, params(f.orgId)), () => billingLedger(f.viewer, params(f.orgId)),
      () => billingCaps(f.viewer, f.orgId), () => billingRates(f.viewer, params(f.orgId))]) {
      await expect(call()).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    }
    // Someone from another workspace: 404.
    const other = await seed();
    await expect(billingSummary({ ...other.owner, workspaces: [...other.owner.workspaces, { id: f.orgId, name: "x", role: "owner" }] }, f.orgId)).rejects.toMatchObject({ status: 404 });
    // Platform admins read (audited) but never change a customer's limits.
    expect((await billingSummary(f.admin, f.orgId))!.level).toBe("owner");
    expect(Number((await owner.query("SELECT count(*) FROM evals.audit_event WHERE org_id=$1 AND actor_id=$2 AND action='support.read'", [f.orgId, f.admin.user.id])).rows[0].count)).toBeGreaterThan(0);
    const body = { orgId: f.orgId, monthlyCapCredits: 5000, perRun: { mode: "multiplier" as const, multiplier: 2 } };
    const put = (key = randomUUID()) => new Request("https://app.caudals.test/api/evals/v1/billing/caps", { method: "PUT", headers: { "idempotency-key": key } });
    await expect(saveBillingCaps(put(), f.admin, body)).rejects.toMatchObject({ status: 404 });
    await expect(saveBillingCaps(put(), f.editor, body)).rejects.toMatchObject({ status: 404 });
    await expect(saveBillingCaps(new Request("https://app.caudals.test/x", { method: "PUT" }), f.owner, body)).rejects.toMatchObject({ status: 400 });
    // Owners save; replays return the same answer; the change is audited by billing.set_spend_cap.
    const key = randomUUID();
    const saved1 = await saveBillingCaps(put(key), f.owner, body);
    expect(await saveBillingCaps(put(key), f.owner, body)).toEqual(saved1);
    expect(saved1).toMatchObject({ monthlyUcr: c(5000).toString(), perRunUcr: null, perRunMultiplier: 2 });
    expect(Number((await owner.query("SELECT count(*) FROM evals.audit_event WHERE org_id=$1 AND action='billing.spend_cap_saved'", [f.orgId])).rows[0].count)).toBe(2);
    await saveBillingCaps(put(), f.owner, { orgId: f.orgId, monthlyCapCredits: null, perRun: { mode: "fixed", credits: 800 } });
    expect(await tx(f.ownerScope, db => readSpendCaps(db, f.orgId))).toMatchObject({ monthlyUcr: null, perRunUcr: c(800) });
  });

  /* ------------------------------------------------- every number = ledger --- */

  it("shows exactly what the ledger holds: balances, usage by day, run and model, CSV and activity", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 1000, "allowance");
    await grant(f, "250.5");
    const a = await run(f), b = await run(f), failed = await run(f, "failed");
    await engineCall(f, a, 2, "0.081734");
    await engineCall(f, a, 3, "1.5");
    await meter(f, a.runId, "website_question", 5, 1);
    await meter(f, a.runId, "website_question", 5, 1);
    await meter(f, b.runId, "api_question", 2, 1);
    await meter(f, null, "document_page", "1.5", 3);
    await engineCall(f, failed, 4, "2.25");
    await meter(f, failed.runId, "website_question", 5, 1);
    // A failed run is refunded (§6.8 step 6); an open hold stays held.
    await tx(system(f.orgId), db => refundRun(db, { orgId: f.orgId, runId: failed.runId, reason: "Run failed for platform reasons" }));
    const openKey = `attempt:${randomUUID()}`;
    await tx(system(f.orgId), db => holdCredits(db, { orgId: f.orgId, key: openKey, amountUcr: c(7), runId: b.runId, attemptId: b.attemptId }));
    const releasedKey = `attempt:${randomUUID()}`;
    await tx(system(f.orgId), async db => { await holdCredits(db, { orgId: f.orgId, key: releasedKey, amountUcr: c(3), runId: b.runId }); await releaseCredits(db, { orgId: f.orgId, key: releasedKey, reason: "failed" }); });
    expect(await issues(f.orgId)).toEqual([]);

    const balances = await account(f.orgId), usage = await ledgerUsage(f.orgId);
    const summary = (await billingSummary(f.owner, f.orgId))!;
    expect(summary.balance).toEqual({ availableUcr: balances.available.toString(), heldUcr: balances.held.toString() });
    expect(balances.held).toBe(c(7));
    expect(summary.month.usedUcr).toBe(usage.net.toString());
    expect(summary.month.committedUcr).toBe((usage.net + balances.held).toString());
    // Totals: 0.081734 + 1.5 + 5 + 5 + 2 + 1.5 + (2.25 + 5 refunded).
    expect(usage.net).toBe(c("15.081734"));
    expect(usage.returned).toBe(c("7.25"));

    const json = await billingUsage(f.owner, new URLSearchParams(`orgId=${f.orgId}`)) as unknown as { totals: { netUcr: string; returnedUcr: string; grossUcr: string }; days: Array<{ netUcr: string }>; runs: Array<{ runId: string | null; netUcr: string; returnedUcr: string; reportId: string | null; evaluationTitle: string | null }>; items: Array<{ kind: string; key: string; netUcr: string; quantity: number; tokens: number }> };
    expect(json.totals).toEqual({ grossUcr: usage.gross.toString(), returnedUcr: usage.returned.toString(), netUcr: usage.net.toString() });
    const sum = (rows: Array<{ netUcr: string }>) => rows.reduce((total, row) => total + B(row.netUcr), BigInt(0));
    expect(sum(json.days)).toBe(usage.net);
    expect(sum(json.runs)).toBe(usage.net);
    expect(sum(json.items)).toBe(usage.net);
    const byRun = new Map(json.runs.map(row => [row.runId, row]));
    expect(byRun.get(a.runId)).toMatchObject({ netUcr: c("11.581734").toString(), evaluationTitle: "Support bot" });
    expect(byRun.get(b.runId)?.netUcr).toBe(c(2).toString());
    expect(byRun.get(failed.runId)).toMatchObject({ netUcr: "0", returnedUcr: c("7.25").toString() });
    expect(byRun.get(null)?.netUcr).toBe(c("1.5").toString());
    const local = json.items.find(item => item.kind === "tokens");
    expect(local).toMatchObject({ key: expect.stringMatching(/^Caudals Local/), netUcr: c("1.581734").toString(), tokens: 4500 });
    expect(json.items.find(item => item.key === "website_question")).toMatchObject({ netUcr: c(10).toString(), quantity: 3 });
    expect(json.items.find(item => item.key === "document_page")).toMatchObject({ netUcr: c("1.5").toString(), quantity: 3 });

    // CSV: every debit entry, exact to the micro-credit; its net column sums to the total.
    const lines = await tx(f.ownerScope, db => usageLines(db, f.orgId, new Date(0), new Date("2100-01-01")));
    expect(lines).toHaveLength(8);
    const csv = usageCsv(lines);
    const rows = csv.trim().split("\r\n").slice(1).map(line => line.split(",").map(cell => JSON.parse(cell) as string));
    expect(rows.reduce((total, row) => total + creditsToUcr(row[11]), BigInt(0))).toBe(usage.net);
    expect(rows.every(row => /^\d{4}-\d\d-\d\dT/.test(row[0]))).toBe(true);
    const response = await billingUsage(f.editor, new URLSearchParams(`orgId=${f.orgId}&format=csv`)) as Response;
    expect(response.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(await response.text()).toBe(csv);

    // Activity: every entry but holds and releases, newest first, with the balance after each.
    const ledger = await billingLedger(f.owner, new URLSearchParams(`orgId=${f.orgId}`));
    const entries = (await owner.query("SELECT id,entry_type,available_after_ucr FROM billing.ledger_entry WHERE org_id=$1 AND entry_type NOT IN ('hold','release') ORDER BY account_version DESC", [f.orgId])).rows;
    expect(ledger.entries.map(entry => entry.id)).toEqual(entries.map(entry => entry.id));
    expect(ledger.entries[0].availableAfterUcr).toBe(String(entries[0].available_after_ucr));
    const page = await billingLedger(f.owner, new URLSearchParams(`orgId=${f.orgId}&limit=3`));
    const next = await billingLedger(f.owner, new URLSearchParams(`orgId=${f.orgId}&limit=3&cursor=${page.nextCursor}`));
    expect([...page.entries, ...next.entries].map(entry => entry.id)).toEqual(entries.slice(0, 6).map(entry => entry.id));
    expect((await billingLedger(f.owner, new URLSearchParams(`orgId=${f.orgId}&holds=1`))).entries.some(entry => entry.type === "hold")).toBe(true);

    // The report for one day only counts that day.
    const today = new Date().toISOString().slice(0, 10);
    const day = await tx(f.ownerScope, db => usageReport(db, f.orgId, new Date(`${today}T00:00:00Z`), new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)));
    expect(day.totals.netUcr).toBe(usage.net);
    expect(ucrToCredits(usage.net)).toBe("15.081734");
  });

  /* ------------------------------------------------- caps and admission --- */

  it("refuses runs over a cap and admits a shortfall that auto-recharge covers", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 100);
    const r = await run(f);
    await meter(f, r.runId, "website_question", 40, 8);
    const caps = (body: Parameters<typeof saveBillingCaps>[2]) => saveBillingCaps(new Request("https://x/", { method: "PUT", headers: { "idempotency-key": randomUUID() } }), f.owner, body);
    await caps({ orgId: f.orgId, monthlyCapCredits: 100, perRun: { mode: "multiplier", multiplier: 2 } });
    // 40 used: a 50-credit run fits, a 70-credit one would pass the monthly limit.
    await tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(50), p90Ucr: c(50), heldUcr: BigInt(0) }));
    await expect(tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(70), p90Ucr: c(70), heldUcr: BigInt(0) })))
      .rejects.toMatchObject({ code: "CAP_REACHED", status: 409 });
    // Held credits count too.
    await expect(tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(50), p90Ucr: c(50), heldUcr: c(20) }))).rejects.toMatchObject({ code: "CAP_REACHED" });
    // A fixed per-run cap below the estimate refuses at start; the default multiple never does.
    await caps({ orgId: f.orgId, monthlyCapCredits: null, perRun: { mode: "fixed", credits: 30 } });
    await expect(tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(50), p90Ucr: c(50), heldUcr: BigInt(0) }))).rejects.toMatchObject({ code: "CAP_REACHED" });
    await caps({ orgId: f.orgId, monthlyCapCredits: null, perRun: { mode: "multiplier", multiplier: 2 } });
    await tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(500), p90Ucr: c(500), heldUcr: BigInt(0) }));
    // At resume the run's own spend counts: 40 spent + 70 left > 2 × 50.
    await expect(tx(f.ownerScope, db => assertWithinCaps(db, f.orgId, { requiredUcr: c(70), p90Ucr: c(50), heldUcr: BigInt(0), runId: r.runId }))).rejects.toMatchObject({ code: "CAP_REACHED" });

    // Auto-recharge: off → no cover; on with a saved card → a €20 pack (2,000 credits) covers a 1,500 shortfall, not 2,500.
    expect(await tx(f.ownerScope, db => autoRechargeCover(db, f.orgId, c(1500)))).toMatchObject({ enabled: false, covers: false });
    await tx(f.ownerScope, db => saveStripeCustomer(db, f.orgId, false, `cus_${randomUUID().replaceAll("-", "")}`));
    await owner.query("UPDATE billing.stripe_customer SET payment_method_id='pm_1CardSaved1234' WHERE org_id=$1", [f.orgId]);
    await tx(f.ownerScope, db => setAutoRecharge(db, f.orgId, { enabled: true, thresholdUcr: c(500), packCents: 2000, monthlyMaxCount: 3, monthlyMaxCents: 30000 }));
    expect(await tx(f.ownerScope, db => autoRechargeCover(db, f.orgId, c(1500)))).toEqual({ enabled: true, covers: true, packCredits: 2000 });
    expect((await tx(f.ownerScope, db => autoRechargeCover(db, f.orgId, c(2500)))).covers).toBe(false);
    // Not where payments are closed (taken off the test list), nor after a failure.
    open();
    expect((await tx(f.ownerScope, db => autoRechargeCover(db, f.orgId, c(1500)))).covers).toBe(false);
    open(f.orgId);
    await owner.query("UPDATE billing.auto_recharge SET failures=1 WHERE org_id=$1", [f.orgId]);
    expect((await tx(f.ownerScope, db => autoRechargeCover(db, f.orgId, c(1500)))).covers).toBe(false);
  });

  /* ---------------------------------------------------------------- watch --- */

  it("pauses runs at a cap where credits are enforced, alerts once, and shows billing notices by role", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 600);
    const active = await run(f, "running");
    await meter(f, active.runId, "website_question", 450, 90);
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };
    const env = { ...process.env, BILLING_UI_ENABLED: "true", BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "shadow", BILLING_TEST_WORKSPACE_IDS: f.orgId,
      BILLING_STRIPE_MODE: "test", COLLABORATION_NOTIFICATION_EMAIL: "" };
    await saveBillingCaps(new Request("https://x/", { method: "PUT", headers: { "idempotency-key": randomUUID() } }), f.owner,
      { orgId: f.orgId, monthlyCapCredits: 500, perRun: { mode: "multiplier", multiplier: 2 } });

    // Shadow mode: no cap pause; the low balance (150 < 500) and 90 % of the monthly cap are alerted.
    const first = await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime });
    expect(first.paused).toBe(0);
    expect(first.alerts.sort()).toEqual(["cap_reached:80", "low_balance"]);
    expect(sent.map(message => message.to)).toEqual([f.ownerUser.email, f.ownerUser.email]);
    expect(sent.map(message => message.subject).join(" ")).toMatch(/balance|limit/i);
    // Once: a second tick sends nothing new.
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime })).alerts).toEqual([]);
    expect(sent).toHaveLength(2);

    // Credits enforced (BILLING_ENFORCE=enforce): the run reaches the 500 cap (450 used + a 60 hold) and pauses with cap_reached.
    await tx(system(f.orgId), db => holdCredits(db, { orgId: f.orgId, key: `attempt:${randomUUID()}`, amountUcr: c(60), runId: active.runId }));
    const enforced = await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime, processMode: "enforce" });
    expect(enforced.paused).toBe(1);
    expect(enforced.alerts).toContain("cap_reached:100");
    const workflow = (await owner.query("SELECT status,reason_code FROM evals.execution_workflow WHERE id=$1", [active.workflowId])).rows[0];
    expect(workflow).toMatchObject({ reason_code: "cap_reached" });
    expect(["paused", "pause_requested"]).toContain(workflow.status);
    expect((await owner.query("SELECT reason_code FROM evals.run WHERE id=$1", [active.runId])).rows[0].reason_code).toBe("cap_reached");

    // A purchase resumes only work paused for credits, never a cap pause.
    expect(await resumeAfterCredits(f.orgId, SCHEDULER, runtime)).toBe(0);
    await owner.query("UPDATE evals.execution_workflow SET reason_code='credits_exhausted' WHERE id=$1", [active.workflowId]);
    expect(await resumeAfterCredits(f.orgId, SCHEDULER, runtime)).toBe(1);
    expect((await owner.query("SELECT status,reason_code FROM evals.execution_workflow WHERE id=$1", [active.workflowId])).rows[0]).toMatchObject({ reason_code: null });

    // Notices: owners and editors see the balance and limit notices; payments are owners' only; viewers see no billing.
    await as(f.ownerUser.id, f.orgId, "INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at) VALUES($1,$2,'auto_recharge_succeeded','workspace','{}','delivered',now())",
      [f.orgId, `fixture:${randomUUID()}`]);
    const kinds = async (scope: { orgId: string; actorId: string }) => (await listNotifications(scope)).notifications.map(item => item.kind).sort();
    const ownerKinds = await kinds(f.ownerScope);
    expect(ownerKinds).toEqual(expect.arrayContaining(["auto_recharge_succeeded", "cap_reached", "low_balance"]));
    const editorKinds = await kinds(f.editorScope);
    expect(editorKinds).toEqual(expect.arrayContaining(["cap_reached", "low_balance"]));
    expect(editorKinds).not.toContain("auto_recharge_succeeded");
    expect((await kinds(f.viewerScope)).filter(kind => ["low_balance", "cap_reached", "auto_recharge_succeeded"].includes(kind))).toEqual([]);
    expect((await listNotifications(f.ownerScope)).notifications.find(item => item.kind === "low_balance")).toMatchObject({ category: "billing", payload: { balance: 150, threshold: 500 } });
  });

  it("sends no alerts where billing does not show, or to a workspace that never had credits", async () => {
    const f = await seed();
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: null }; };
    const env = { ...process.env, BILLING_UI_ENABLED: "true", BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "shadow", BILLING_TEST_WORKSPACE_IDS: "", BILLING_STRIPE_MODE: "test" };
    // Zero balance, never funded: nothing, even where billing shows.
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env: { ...env, BILLING_TEST_WORKSPACE_IDS: f.orgId }, send, pool: runtime })).alerts).toEqual([]);
    await grant(f, 10);
    // Funded but not eligible: nothing.
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime })).alerts).toEqual([]);
    // The UI flag off: nothing.
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env: { ...env, BILLING_UI_ENABLED: "false", BILLING_TEST_WORKSPACE_IDS: f.orgId }, send, pool: runtime })).alerts).toEqual([]);
    expect(sent).toEqual([]);
    expect(Number((await owner.query("SELECT count(*) FROM evals.notification WHERE org_id=$1 AND kind='low_balance'", [f.orgId])).rows[0].count)).toBe(0);
  });

  /* -------------------------------------------- G2: threshold and spend --- */

  const capsRequest = () => new Request("https://x/", { method: "PUT", headers: { "idempotency-key": randomUUID() } });
  const perRun = { mode: "multiplier" as const, multiplier: 2 };

  it("alerts below the owner's own low-balance threshold, audited, and goes back to the default (G2, §6.10/§6.12)", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 700);
    const env = { ...process.env, BILLING_UI_ENABLED: "true", BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "shadow", BILLING_TEST_WORKSPACE_IDS: f.orgId,
      BILLING_STRIPE_MODE: "test", COLLABORATION_NOTIFICATION_EMAIL: "" };
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };
    // Default: 500 credits (no pack bought yet), so 700 is not low.
    expect(await billingCaps(f.owner, f.orgId)).toMatchObject({ lowBalanceThresholdUcr: String(c(500)), lowBalanceCustomUcr: null, lowBalanceDefaultUcr: String(c(500)) });
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime })).alerts).not.toContain("low_balance");
    // Owners set it; editors read it but cannot.
    await expect(saveBillingCaps(capsRequest(), f.editor, { orgId: f.orgId, monthlyCapCredits: null, perRun, lowBalanceThresholdCredits: 800 })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(saveBillingCaps(capsRequest(), f.owner, { orgId: f.orgId, monthlyCapCredits: null, perRun, lowBalanceThresholdCredits: 0 })).rejects.toThrow();
    expect(await saveBillingCaps(capsRequest(), f.owner, { orgId: f.orgId, monthlyCapCredits: null, perRun, lowBalanceThresholdCredits: 800 }))
      .toMatchObject({ lowBalanceThresholdUcr: String(c(800)), lowBalanceCustomUcr: String(c(800)), lowBalanceDefaultUcr: String(c(500)) });
    expect(await billingCaps(f.editor, f.orgId)).toMatchObject({ lowBalanceThresholdUcr: String(c(800)), recipients: null });
    const events = (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='billing.low_balance_threshold_saved'", [f.orgId])).rows;
    expect(events).toEqual([{ actor_id: f.ownerUser.id, details: expect.objectContaining({ before: { low_balance_threshold_ucr: null }, after: { low_balance_threshold_ucr: Number(c(800)) } }) }]);
    // The banner and the alert use it: 700 < 800.
    expect((await billingSummary(f.owner, f.orgId))!.lowBalance).toEqual({ thresholdUcr: String(c(800)), below: true });
    const tick = await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime });
    expect(tick.alerts).toContain("low_balance");
    expect(sent.find(message => /balance is low/.test(message.subject))?.text).toContain("below your alert threshold of 800");
    expect((await listNotifications(f.ownerScope)).notifications.find(item => item.kind === "low_balance")).toMatchObject({ payload: { balance: 700, threshold: 800 } });
    // Saving the caps without the field keeps it; null goes back to the default rule.
    await saveBillingCaps(capsRequest(), f.owner, { orgId: f.orgId, monthlyCapCredits: 5000, perRun });
    expect((await billingCaps(f.owner, f.orgId)).lowBalanceCustomUcr).toBe(String(c(800)));
    expect(await saveBillingCaps(capsRequest(), f.owner, { orgId: f.orgId, monthlyCapCredits: 5000, perRun, lowBalanceThresholdCredits: null }))
      .toMatchObject({ lowBalanceThresholdUcr: String(c(500)), lowBalanceCustomUcr: null });
    // The database checks the owner and whole credits.
    await expect(as(f.editorScope.actorId, f.orgId, "SELECT billing.set_low_balance_threshold($1,$2,NULL)", [f.orgId, String(c(900))])).rejects.toThrow("SCOPE_DENIED");
    await expect(as(f.ownerUser.id, f.orgId, "SELECT billing.set_low_balance_threshold($1,1500000,NULL)", [f.orgId])).rejects.toThrow("INPUT_INVALID");
  });

  it("emails unusual spend once per day to owners who keep billing email on, in their language (G2, §6.10)", async () => {
    const f = await seed();
    open(f.orgId);
    await grant(f, 2000);
    const r = await run(f);
    // Four weeks of history: 56 credits ten days ago (moved back in time; balances and lots untouched).
    const history = await meter(f, r.runId, "website_question", 56, 11);
    await as(SCHEDULER, f.orgId, "UPDATE billing.ledger_entry SET created_at = now() - interval '10 days' WHERE id=$1", [history.id], true);
    // Then 300 credits today: over 3 × the daily average (2 credits).
    await meter(f, r.runId, "website_question", 300, 60);
    // A second owner who switched billing email off.
    const quiet = await user(`billing-quiet-${randomUUID().slice(0, 8)}@caudals.com`);
    await as(f.ownerUser.id, f.orgId, "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [f.orgId, quiet.id]);
    await owner.query("INSERT INTO evals.notification_preference(org_id,user_id,email_billing) VALUES($1,$2,false)", [f.orgId, quiet.id]);
    await owner.query("INSERT INTO evals.email_preference(user_id,locale) VALUES($1,'es') ON CONFLICT (user_id) DO UPDATE SET locale='es'", [f.ownerUser.id]);
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };
    const env = { ...process.env, BILLING_UI_ENABLED: "true", BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "shadow", BILLING_TEST_WORKSPACE_IDS: f.orgId,
      BILLING_STRIPE_MODE: "test", COLLABORATION_NOTIFICATION_EMAIL: "" };
    const today = new Date();
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 2));
    const tick = await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime, now: tomorrow });
    expect(tick.alerts).toContain("unusual_spend");
    const spend = sent.filter(message => message.idempotencyKey?.startsWith("billing-unusual_spend:"));
    expect(spend.map(message => message.to)).toEqual([f.ownerUser.email]);
    expect(spend[0].subject).toBe("Gasto de créditos inusual en Billing fixture");
    expect(spend[0].text).toContain("usó 300 créditos el");
    expect(spend[0].text).toContain("(2 créditos)");
    expect(spend[0].text).toContain("tab=billing&view=usage");
    expect(spend[0].text).toContain("tab=notifications");
    // Once per day: the next tick sends nothing.
    expect((await runBillingWatch({ orgId: f.orgId, actorId: SCHEDULER }, { env, send, pool: runtime, now: tomorrow })).alerts).not.toContain("unusual_spend");
    expect(sent.filter(message => message.idempotencyKey?.startsWith("billing-unusual_spend:"))).toHaveLength(1);
    const notice = (await listNotifications(f.ownerScope)).notifications.find(item => item.kind === "unusual_spend");
    expect(notice).toMatchObject({ category: "billing", payload: { credits: 300, average: 2 } });
    // Test mode never emails outside Caudals: an owner at another domain is skipped.
    const g = await seed();
    open(g.orgId);
    await owner.query("UPDATE public.auth_user SET email=$2 WHERE id=$1", [g.ownerUser.id, `${randomUUID()}@example.test`]);
    await grant(g, 2000);
    const gr = await run(g);
    const old = await meter(g, gr.runId, "website_question", 56, 11);
    await as(SCHEDULER, g.orgId, "UPDATE billing.ledger_entry SET created_at = now() - interval '10 days' WHERE id=$1", [old.id], true);
    await meter(g, gr.runId, "website_question", 300, 60);
    const before = sent.length;
    expect((await runBillingWatch({ orgId: g.orgId, actorId: SCHEDULER }, { env: { ...env, BILLING_TEST_WORKSPACE_IDS: g.orgId }, send, pool: runtime, now: tomorrow })).alerts).toContain("unusual_spend");
    expect(sent.length).toBe(before);
  });

  /* ------------------------------------------------- estimate and admission --- */

  it("serves the run estimate to editors where billing shows, with the gate admission applies", async () => {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    const target = (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [f.run.id])).rows[0].target_revision_id;
    await owner.query("UPDATE evals.evaluation SET selected_target_revision_id=$2,selected_suite_version_id=$3 WHERE id=$1", [f.evaluationId, target, f.suiteVersionId]);
    await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [f.orgId]);
    const editorUser = await user(), ownerUser = await user();
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'editor'),($1,$3,'owner')", [f.orgId, editorUser.id, ownerUser.id]);
    const editor: EvalIdentity = { user: { id: editorUser.id, email: editorUser.email, name: "e" }, platformRole: null, workspaces: [{ id: f.orgId, name: "Judge fixture", role: "editor" }] };
    const body = { orgId: f.orgId, evaluationId: f.evaluationId };
    const request = () => new Request("https://app.caudals.test/api/evals/v1/billing/estimates", { method: "POST", headers: { "idempotency-key": randomUUID() } });
    process.env.BILLING_ESTIMATES_ENABLED = "operators";
    // Not eligible: editors stay outside the operators rollout.
    await expect(estimateForMember(request(), editor, body)).rejects.toMatchObject({ status: 404 });
    open(f.orgId);
    process.env.BILLING_ESTIMATES_ENABLED = "operators";
    const shadow = await estimateForMember(request(), editor, body) as Awaited<ReturnType<typeof estimateEvaluationRun>> & { gate: { enforced: boolean; canStart: boolean; autoRechargeCovers: boolean } };
    const direct = await tx({ orgId: f.orgId, actorId: editorUser.id }, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId }));
    // The dialog's numbers are the estimator's (and admission's).
    expect({ credits: shadow.credits, euros: shadow.euros, largestHold: shadow.largestHold, questions: shadow.questions }).toEqual({ credits: direct.credits, euros: direct.euros, largestHold: direct.largestHold, questions: direct.questions });
    expect(shadow.gate).toMatchObject({ enforced: false, canStart: true });
    expect(shadow.models.judge?.credits).toEqual({ input: "50", output: "200" });
    process.env.BILLING_ENFORCE = "enforce";
    const blocked = await estimateForMember(request(), editor, body) as typeof shadow;
    expect(blocked.balance).toMatchObject({ coversP90: false });
    expect(blocked.gate).toEqual({ enforced: true, autoRechargeCovers: false, autoRechargePackCredits: null, canStart: false });
    const run = { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: target };
    const scope = { orgId: f.orgId, actorId: editorUser.id };
    await expect(tx(scope, db => admitRun(db, "enforce", f.orgId, run))).rejects.toMatchObject({ code: "CREDITS_EXHAUSTED", status: 402 });
    // Auto-recharge with a saved card covers the gap: the dialog lets the run start and admission agrees.
    const ownerScope = { orgId: f.orgId, actorId: ownerUser.id };
    await tx(ownerScope, db => saveStripeCustomer(db, f.orgId, false, `cus_${randomUUID().replaceAll("-", "")}`));
    await owner.query("UPDATE billing.stripe_customer SET payment_method_id='pm_1CardSaved1234' WHERE org_id=$1", [f.orgId]);
    await tx(ownerScope, db => setAutoRecharge(db, f.orgId, { enabled: true, thresholdUcr: c(500), packCents: 2000, monthlyMaxCount: 3, monthlyMaxCents: 30000 }));
    const covered = await estimateForMember(request(), editor, body) as typeof shadow;
    expect(covered.gate).toMatchObject({ enforced: true, autoRechargeCovers: true, canStart: true });
    await tx(scope, db => admitRun(db, "enforce", f.orgId, run));
    // A monthly cap below the estimate refuses with CAP_REACHED.
    await tx(ownerScope, db => db.query("SELECT billing.set_spend_cap($1,'workspace_monthly',NULL,$2,NULL,NULL)", [f.orgId, (BigInt(direct.ucr.p90) / BigInt(2)).toString()]));
    await expect(tx(scope, db => admitRun(db, "enforce", f.orgId, run))).rejects.toMatchObject({ code: "CAP_REACHED", status: 409 });
    // Contract workspaces are never gated.
    await owner.query("UPDATE evals.workspace_entitlement SET plan='managed' WHERE org_id=$1", [f.orgId]);
    await tx(scope, db => admitRun(db, "enforce", f.orgId, run));
    expect(((await estimateForMember(request(), editor, body)) as typeof shadow).gate).toMatchObject({ enforced: false, canStart: true });
  });
});
