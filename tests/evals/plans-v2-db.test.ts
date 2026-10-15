/**
 * Plans v2 on the production schema (migration 093; spec v2 §6.5, §6.10,
 * §6.18; P-09; package L-14): the plan triggers for free, pay-as-you-go,
 * managed and partner workspaces (managed unchanged), free → PAYG in the
 * purchase transaction (once, under concurrency, atomic), the monthly
 * allowance (once per workspace and month), the admin overrides (audited,
 * admins only) and the live-payments allowlist, typed limits, the plan
 * summary, the first top-up bonus rule and the rollback guard. Stripe is never
 * called; the database is scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import type Stripe from "stripe";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { inputError, PlanLimitError } from "../../lib/evals/domain/errors";
import { typedPlanLimit } from "../../lib/evals/domain/plan-limits";
import { verifyAccounts } from "../../lib/billing/ledger";
import { createTopUpOrder, saveProfile, type ProfileInput } from "../../lib/billing/payments";
import { settlePayment, settlePaymentInTransaction, WEBHOOK_ACTOR } from "../../lib/billing/settlement";
import { refundTopUp } from "../../lib/billing/refunds";
import { allowanceKey, allowancePeriod, runMonthlyAllowance } from "../../lib/billing/allowance";
import { getWorkspaceOverride, listWorkspaceOverrides, setWorkspaceOverride, type OverrideInput } from "../../lib/billing/overrides";
import { paymentsAccessFor, resolvePaymentsAccess } from "../../lib/billing/payments-config";
import { planSummary } from "../../lib/billing/plan-summary";
import { FREE_LIMITS, MONTHLY_ALLOWANCE_CREDITS, PAYG_LIMITS, type Plan } from "../../lib/billing/plans";
import { monthEnd } from "../../lib/billing/config";
import { creditsToUcr } from "../../lib/billing/units";
import type { EvalIdentity } from "../../lib/evals/domain/identity";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";
const c = (credits: number) => creditsToUcr(credits);
const rid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const ENV_KEYS = ["PLANS_V2_ENABLED", "BILLING_CREDITS_ENABLED", "BILLING_STRIPE_MODE", "STRIPE_SECRET_KEY", "BILLING_TEST_WORKSPACE_IDS",
  "LEGAL_ENTITY_NAME", "LEGAL_ENTITY_NIF", "LEGAL_ENTITY_ADDRESS", "CALCOM_LINK"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

describe.skipIf(!ownerUrl || !runtimeUrl)("plans v2 on the production schema (L-14)", () => {
  process.env.EVALS_DATABASE_URL = runtimeUrl;
  const owner = new Pool({ connectionString: ownerUrl, max: 6 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 20 });
  const rolePool = (role: string) => {
    const pool = new Pool({ connectionString: ownerUrl, max: 2 });
    pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
    return pool;
  };
  const worker = rolePool("evals_worker");
  afterEach(() => { for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  afterAll(async () => { await Promise.all([owner.end(), runtime.end(), worker.end(), getEvalsPool().end()]); });

  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);

  /* ------------------------------------------------------------ fixtures --- */

  async function user(platformAdmin = false) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Plans fixture", `${randomUUID()}@example.test`]);
    if (platformAdmin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    return id;
  }

  /** A fixture write as the owner role, with the actor and workspace set as the app would. */
  async function as(actorId: string, orgId: string, sql: string, params: unknown[] = [], options: { skipValidation?: boolean } = {}) {
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      // A placeholder suite version for runs to point at: its case validation is not under test.
      if (options.skipValidation) await client.query("SET LOCAL session_replication_role = replica");
      const result = await client.query(sql, params);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  /** A workspace on a plan, its owner, a project, an evaluation and a target revision to run against. */
  async function seed(plan: Plan, limits: Partial<Record<"max_systems" | "max_tests_per_set" | "max_runs_per_month" | "max_active_runs" | "max_members", number | null>> = {}) {
    const ownerId = await user(), orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Plans fixture',$2)", [orgId, ownerId]);
    await as(ownerId, orgId, "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    if (plan === "free") {
      // As evals.enroll_self_serve enrolls a free workspace (migrations 075, 085).
      await as(ownerId, orgId, `UPDATE evals.workspace_entitlement SET plan='free',max_active_runs=1,allowed_connection_types=ARRAY['website','openai_compatible','https_json'],
        can_schedule=false,can_export=true,review_allowance=0,max_systems=1,max_tests_per_set=50,max_runs_per_month=3 WHERE org_id=$1`, [orgId]);
    } else if (plan !== "managed") {
      await as(ownerId, orgId, "UPDATE evals.workspace_entitlement SET plan=$2 WHERE org_id=$1", [orgId, plan]);
    }
    for (const [column, value] of Object.entries(limits)) {
      await as(ownerId, orgId, `UPDATE evals.workspace_entitlement SET ${column}=$2 WHERE org_id=$1`, [orgId, value]);
    }
    await as(ownerId, orgId, "INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Plans fixture')", [projectId, orgId]);
    await as(ownerId, orgId, "INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Plans fixture','source_grounded',10,'EUR')", [evaluationId, orgId, projectId]);
    // What runs point at: an archived system (never counted), its revision and a suite version.
    const targetId = randomUUID(), revisionId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID();
    await as(ownerId, orgId, "INSERT INTO evals.target(id,org_id,project_id,title,archived_at) VALUES($1,$2,$3,'Run target',now())", [targetId, orgId, projectId]);
    await as(ownerId, orgId, "INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,'{}')", [revisionId, orgId, targetId, "a".repeat(64)]);
    await as(ownerId, orgId, "INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Suite')", [suiteId, orgId, projectId]);
    await as(ownerId, orgId, "INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,'{}')", [suiteVersionId, orgId, suiteId, "b".repeat(64)], { skipValidation: true });
    return { orgId, ownerId, projectId, evaluationId, revisionId, suiteVersionId, customer: { orgId, actorId: ownerId }, domain: `acme-${randomUUID().slice(0, 8)}.test` };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;

  const addTarget = async (f: Fixture, db?: PoolClient) => {
    const id = randomUUID(), sql = "INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'System')", params = [id, f.orgId, f.projectId];
    if (db) await db.query(sql, params); else await as(f.ownerId, f.orgId, sql, params);
    return id;
  };
  const addRun = (f: Fixture) => as(f.ownerId, f.orgId, `INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase)
    VALUES($1,$2,$3,$4,$5,'deployed_system','completed','done')`, [randomUUID(), f.orgId, f.evaluationId, f.revisionId, f.suiteVersionId]);
  const invite = (f: Fixture, extra: { revoked?: boolean; expired?: boolean } = {}) => as(f.ownerId, f.orgId, 
    `INSERT INTO evals.invitation(org_id,email,role,token_hash,expires_at,created_by,revoked_at) VALUES($1,$2,'editor',$3,now()+$4::interval,$5,$6)`,
    [f.orgId, `${randomUUID()}@example.test`, randomUUID().replaceAll("-", "").padEnd(64, "0"), extra.expired ? "-1 hour" : "24 hours", f.ownerId, extra.revoked ? new Date() : null]);
  const requested = async (f: Fixture, count: number) => (await as(f.ownerId, f.orgId, `INSERT INTO evals.generation_job(org_id,evaluation_id,workflow_id,title,execution_mode,
      source_revision_ids,prompt_revision,prompt_revision_id,status,created_by,requested_case_count)
    VALUES($1,$2,$3,'Set','deployed_system',ARRAY[$4::uuid],'fixture',$5,'profiling',$6,$7) RETURNING requested_case_count`,
  [f.orgId, f.evaluationId, randomUUID(), randomUUID(), randomUUID(), f.ownerId, count])).rows[0].requested_case_count;
  const entitlement = async (orgId: string) => (await owner.query(`SELECT plan,max_systems,max_tests_per_set,max_runs_per_month,max_active_runs,max_members,
      can_schedule,allowed_connection_types FROM evals.workspace_entitlement WHERE org_id=$1`, [orgId])).rows[0];
  const billingMode = async (orgId: string) => (await owner.query("SELECT billing_mode FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0].billing_mode;
  const issues = async (orgId: string) => (await tx({ orgId, actorId: WEBHOOK_ACTOR }, db => verifyAccounts(db, orgId)))[0].issues;
  const audits = async (orgId: string, action: string) => (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action=$2 ORDER BY created_at", [orgId, action])).rows;

  const profile = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    legalName: "Acme Software SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
    viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1",
    addressLine2: null, postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.test", ...overrides,
  });
  const withProfile = async (f: Fixture, overrides: Partial<ProfileInput> = {}) => { await tx(f.customer, db => saveProfile(db, f.orgId, profile(overrides))); return f; };
  const order = (f: Fixture, netCents = 2000, domain: string | null = f.domain) =>
    tx(f.customer, db => createTopUpOrder(db, { orgId: f.orgId, key: `checkout:${randomUUID()}`, netCents, livemode: false, buyerDomain: domain }));
  const pay = (f: Fixture, o: { id: string; grossCents: number }, pi = rid("pi")) =>
    settlePayment({ orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: pi }, WEBHOOK_ACTOR, runtime);

  async function override(orgId: string, values: Partial<Omit<OverrideInput, "orgId">>, adminId?: string) {
    const admin = adminId ?? await user(true);
    return tx({ orgId, actorId: admin }, db => setWorkspaceOverride(db, { orgId, enforcement: "inherit", livePayments: false, plansV2: false, reason: "L-14 test override", ...values }));
  }

  /* ------------------------------------------------------------ triggers --- */

  it("enforces each plan's limits in the triggers; managed workspaces stay unlimited", async () => {
    // Free: one system, three runs a month, 50 questions per set, no member cap.
    const free = await seed("free");
    await addTarget(free);
    const refused = await addTarget(free).catch(error => error);
    expect(refused).toMatchObject({ message: "PLAN_LIMIT_SYSTEMS" });
    expect(JSON.parse(refused.detail)).toEqual({ org_id: free.orgId, limit: 1 });
    for (let index = 0; index < 3; index++) await addRun(free);
    const runs = await addRun(free).catch(error => error);
    expect(runs).toMatchObject({ message: "PLAN_LIMIT_RUNS" });
    expect(JSON.parse(runs.detail)).toEqual({ org_id: free.orgId, limit: 3 });
    expect(await requested(free, 100)).toBe(50);
    for (let index = 0; index < 12; index++) await invite(free);

    // Pay as you go: ten systems, no monthly run cap, 500 questions (above the 200 a job can ask), ten members.
    const payg = await seed("payg", { max_systems: 10, max_tests_per_set: 500, max_runs_per_month: null, max_active_runs: 2, max_members: 10 });
    for (let index = 0; index < 10; index++) await addTarget(payg);
    await expect(addTarget(payg)).rejects.toMatchObject({ message: "PLAN_LIMIT_SYSTEMS" });
    for (let index = 0; index < 5; index++) await addRun(payg);
    expect(await requested(payg, 200)).toBe(200);
    // The owner plus nine invitations fill ten seats; Caudals operators, revoked and expired invitations never count.
    await as(payg.ownerId, payg.orgId, "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [payg.orgId, await user()]);
    await invite(payg, { revoked: true });
    await invite(payg, { expired: true });
    for (let index = 0; index < 9; index++) await invite(payg);
    const members = await invite(payg).catch(error => error);
    expect(members).toMatchObject({ message: "PLAN_LIMIT_MEMBERS" });
    expect(JSON.parse(members.detail)).toEqual({ org_id: payg.orgId, limit: 10 });

    // Managed (the default plan): unchanged, no caps anywhere.
    const managed = await seed("managed");
    expect(await entitlement(managed.orgId)).toMatchObject({ plan: "managed", max_systems: null, max_tests_per_set: null, max_runs_per_month: null, max_members: null });
    for (let index = 0; index < 12; index++) await addTarget(managed);
    for (let index = 0; index < 5; index++) await addRun(managed);
    expect(await requested(managed, 200)).toBe(200);
    for (let index = 0; index < 12; index++) await invite(managed);
    expect(await billingMode(managed.orgId)).toBe("contract");

    // Partner: per agreement; a cap is enforced, no cap means none.
    const partner = await seed("partner", { max_systems: 2 });
    await addTarget(partner);
    await addTarget(partner);
    await expect(addTarget(partner)).rejects.toMatchObject({ message: "PLAN_LIMIT_SYSTEMS" });
    for (let index = 0; index < 5; index++) await addRun(partner);
    expect(await billingMode(partner.orgId)).toBe("credits");
  }, 60_000);

  it("serialises capped inserts: two systems at once on the free plan, exactly one is created", async () => {
    const free = await seed("free");
    const results = await Promise.allSettled([0, 1, 2].map(() => tx(free.customer, db => addTarget(free, db))));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected").map(result => (result as PromiseRejectedResult).reason.message)).toEqual(["PLAN_LIMIT_SYSTEMS", "PLAN_LIMIT_SYSTEMS"]);
  });

  /* --------------------------------------------------- free → pay as you go --- */

  it("moves a free workspace to pay as you go in the purchase transaction, once, under concurrency", async () => {
    process.env.PLANS_V2_ENABLED = "true";
    const f = await withProfile(await seed("free"));
    // An operator had raised one limit: the upgrade never lowers it.
    await as(f.ownerId, f.orgId, "UPDATE evals.workspace_entitlement SET max_active_runs=3 WHERE org_id=$1", [f.orgId]);
    const one = await order(f), two = await order(f);
    const results = await Promise.all([one, two, one, two].map(o => pay(f, o)));
    expect(results.filter(result => result.upgraded)).toHaveLength(1);
    expect(await entitlement(f.orgId)).toEqual({
      plan: "payg", max_systems: PAYG_LIMITS.systems, max_tests_per_set: PAYG_LIMITS.questionsPerSet, max_runs_per_month: PAYG_LIMITS.runsPerMonth,
      max_active_runs: 3, max_members: PAYG_LIMITS.members, can_schedule: true, allowed_connection_types: [...PAYG_LIMITS.connectionTypes],
    });
    expect(PAYG_LIMITS.activeRuns).toBe(2);
    expect(await billingMode(f.orgId)).toBe("credits");
    const upgrades = await audits(f.orgId, "workspace.plan_upgraded");
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]).toMatchObject({ actor_id: WEBHOOK_ACTOR, details: { before: { plan: "free", max_systems: 1 }, after: { plan: "payg", max_systems: 10, max_members: 10 } } });
    expect(Number((await owner.query("SELECT count(*) FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='purchase'", [f.orgId])).rows[0].count)).toBe(2);
    expect(await issues(f.orgId)).toEqual([]);
    // A second workspace with ordinary free limits gets exactly the PAYG limits.
    const g = await withProfile(await seed("free"));
    await pay(g, await order(g));
    expect(await entitlement(g.orgId)).toMatchObject({ plan: "payg", max_active_runs: PAYG_LIMITS.activeRuns });
  });

  it("commits the upgrade and the purchase together or not at all", async () => {
    process.env.PLANS_V2_ENABLED = "true";
    const f = await withProfile(await seed("free"));
    const o = await order(f);
    class Rollback extends Error {}
    await tx({ orgId: f.orgId, actorId: WEBHOOK_ACTOR }, async db => {
      const settled = await settlePaymentInTransaction(db, { orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: rid("pi") });
      expect(settled.upgraded).toBe(true);
      expect((await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [f.orgId])).rows[0].plan).toBe("payg");
      throw new Rollback();
    }).catch(error => { if (!(error instanceof Rollback)) throw error; });
    expect(await entitlement(f.orgId)).toMatchObject({ plan: "free", max_systems: 1 });
    expect(Number((await owner.query("SELECT count(*) FROM billing.ledger_entry WHERE org_id=$1", [f.orgId])).rows[0].count)).toBe(0);
    expect((await owner.query("SELECT status FROM billing.top_up_order WHERE id=$1", [o.id])).rows[0].status).toBe("pending");
  });

  it("keeps the plan when plans v2 is off, upgrades with the workspace override, and never touches managed workspaces", async () => {
    delete process.env.PLANS_V2_ENABLED;
    const off = await withProfile(await seed("free"));
    expect((await pay(off, await order(off))).upgraded).toBe(false);
    expect(await entitlement(off.orgId)).toMatchObject({ plan: "free", max_systems: 1 });
    // The same workspace once an admin switches plans v2 on for it: the next payment (or a replay) upgrades.
    await override(off.orgId, { plansV2: true });
    expect((await pay(off, await order(off))).upgraded).toBe(true);
    expect(await entitlement(off.orgId)).toMatchObject({ plan: "payg" });

    process.env.PLANS_V2_ENABLED = "true";
    const managed = await withProfile(await seed("managed"));
    expect((await pay(managed, await order(managed))).upgraded).toBe(false);
    expect(await entitlement(managed.orgId)).toMatchObject({ plan: "managed", max_systems: null, max_members: null });
    expect(await billingMode(managed.orgId)).toBe("contract");

    // Only a paid order of the workspace, and only services or admins.
    const pending = await withProfile(await seed("free"));
    const unpaid = await order(pending);
    await expect(tx({ orgId: pending.orgId, actorId: WEBHOOK_ACTOR }, db => db.query("SELECT evals.upgrade_plan_on_purchase($1,$2)", [pending.orgId, unpaid.id]))).rejects.toThrow(/ORDER_NOT_PAID/);
    await expect(tx(pending.customer, db => db.query("SELECT evals.upgrade_plan_on_purchase($1,$2)", [pending.orgId, unpaid.id]))).rejects.toThrow(/SCOPE_DENIED/);
  });

  /* ---------------------------------------------------- monthly allowance --- */

  it("grants 1,000 credits once per workspace and month, expiring at month end, only with plans v2", async () => {
    process.env.BILLING_CREDITS_ENABLED = "true";
    delete process.env.PLANS_V2_ENABLED;
    const free = await seed("free");
    const before = await runMonthlyAllowance(SCHEDULER, { pool: runtime });
    expect((await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1", [free.orgId])).rows[0].n).toBe(0);
    expect(before.failed).toBe(0);
    // Plans v2 for this workspace only (an admin override): three schedulers at once, one grant.
    await override(free.orgId, { plansV2: true });
    const now = new Date();
    await Promise.all([0, 1, 2].map(() => runMonthlyAllowance(SCHEDULER, { pool: runtime, now })));
    await runMonthlyAllowance(SCHEDULER, { pool: runtime, now });
    const grants = (await owner.query(`SELECT e.entry_type,e.amount_ucr::text,e.idempotency_key,e.actor_id,l.source,l.unit_price_eur::text,l.expires_at,l.campaign
      FROM billing.ledger_entry e JOIN billing.credit_lot l ON l.id=(e.lot_allocations->0->>'lot')::uuid WHERE e.org_id=$1`, [free.orgId])).rows;
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ entry_type: "allowance", amount_ucr: c(MONTHLY_ALLOWANCE_CREDITS).toString(), idempotency_key: `grant:${allowanceKey(allowancePeriod(now))}`,
      actor_id: SCHEDULER, source: "allowance", campaign: "monthly_allowance" });
    expect(Number(grants[0].unit_price_eur)).toBe(0); // no cash value
    expect(new Date(grants[0].expires_at).toISOString()).toBe(monthEnd(now).toISOString());
    // The next month is a new allowance.
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
    await runMonthlyAllowance(SCHEDULER, { pool: runtime, now: next });
    expect((await owner.query("SELECT idempotency_key FROM billing.ledger_entry WHERE org_id=$1 ORDER BY account_version", [free.orgId])).rows.map(row => row.idempotency_key))
      .toEqual([`grant:allowance:${allowancePeriod(now)}`, `grant:allowance:${allowancePeriod(next)}`]);
    expect(await issues(free.orgId)).toEqual([]);
    // With the credit layer off, nothing runs at all.
    delete process.env.BILLING_CREDITS_ENABLED;
    expect(await runMonthlyAllowance(SCHEDULER, { pool: runtime, now: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 2)) })).toEqual({ due: 0, granted: 0, failed: 0, resumed: 0 });
  });

  it("lists free and PAYG workspaces for the allowance with PLANS_V2_ENABLED; never managed, partner, deleted or frozen ones", async () => {
    const free = await seed("free"), payg = await seed("payg"), managed = await seed("managed"), partner = await seed("partner");
    const deleted = await seed("free"), frozen = await seed("free");
    await as(deleted.ownerId, deleted.orgId, "UPDATE evals.workspace SET deleted_at=now() WHERE id=$1", [deleted.orgId]);
    await as(frozen.ownerId, frozen.orgId, "UPDATE billing.credit_account SET frozen_reason='dispute:fixture' WHERE org_id=$1", [frozen.orgId]);
    const due = async (all: boolean) => new Set((await tx({ orgId: "", actorId: SCHEDULER }, db => db.query("SELECT billing.allowance_due($1,$2,1000) AS org_id", [allowancePeriod(), all]))).rows.map(row => row.org_id));
    const all = await due(true);
    expect([free, payg].every(f => all.has(f.orgId))).toBe(true);
    expect([managed, partner, deleted, frozen].some(f => all.has(f.orgId))).toBe(false);
    const overridden = await due(false);
    expect(overridden.has(free.orgId)).toBe(false);
    // Customers cannot ask.
    await expect(tx(free.customer, db => db.query("SELECT billing.allowance_due($1,true,10)", [allowancePeriod()]))).rejects.toThrow(/SCOPE_DENIED/);
  });

  /* ------------------------------------------------------------ overrides --- */

  it("lets only platform admins set overrides, with a reason, audited, readable by the workspace's own roles", async () => {
    const f = await seed("free"), g = await seed("free");
    const admin = await user(true);
    const input = { orgId: f.orgId, enforcement: "enforce" as const, livePayments: true, plansV2: true, reason: "Internal enforcement test" };
    await expect(tx(f.customer, db => setWorkspaceOverride(db, input))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(tx({ orgId: f.orgId, actorId: SCHEDULER }, db => setWorkspaceOverride(db, input))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(tx({ orgId: f.orgId, actorId: admin }, db => setWorkspaceOverride(db, { ...input, reason: "  " }))).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    // The transaction must be scoped to the workspace it changes.
    await expect(tx({ orgId: g.orgId, actorId: admin }, db => setWorkspaceOverride(db, input))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const first = await tx({ orgId: f.orgId, actorId: admin }, db => setWorkspaceOverride(db, input));
    expect(first).toMatchObject({ enforcement: "enforce", livePayments: true, plansV2: true, version: 1, updatedBy: admin });
    const second = await tx({ orgId: f.orgId, actorId: admin }, db => setWorkspaceOverride(db, { ...input, livePayments: false, reason: "Live test done" }));
    expect(second).toMatchObject({ livePayments: false, version: 2 });
    const trail = await audits(f.orgId, "billing.workspace_override");
    expect(trail.map(row => [row.actor_id, row.details.before, row.details.after, row.details.reason])).toEqual([
      [admin, null, { enforcement: "enforce", live_payments: true, plans_v2: true }, "Internal enforcement test"],
      [admin, { enforcement: "enforce", live_payments: true, plans_v2: true }, { enforcement: "enforce", live_payments: false, plans_v2: true }, "Live test done"],
    ]);
    // Reads: the workspace's own transaction (runtime and workers), nobody else's.
    expect(await tx(f.customer, db => getWorkspaceOverride(db, f.orgId))).toEqual({ enforcement: "enforce", livePayments: false, plansV2: true });
    expect(await tx(g.customer, db => getWorkspaceOverride(db, f.orgId))).toEqual({ enforcement: "inherit", livePayments: false, plansV2: false });
    expect(await withTenant({ orgId: f.orgId, actorId: "service:evals-worker" }, db => getWorkspaceOverride(db, f.orgId), worker)).toMatchObject({ enforcement: "enforce" });
    await expect(withTenant({ orgId: f.orgId, actorId: "service:evals-worker" }, db => db.query("UPDATE billing.workspace_override SET plans_v2=false"), worker)).rejects.toThrow(/permission denied/);
    // The admin list.
    expect((await tx({ orgId: "", actorId: admin }, db => listWorkspaceOverrides(db))).find(row => row.orgId === f.orgId)).toMatchObject({ plan: "free", billingMode: "free", plansV2: true });
    await expect(tx({ orgId: "", actorId: f.ownerId }, db => listWorkspaceOverrides(db))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("opens live top-ups only to allowlisted workspaces before Gate B, and to every owner with PLANS_V2_ENABLED", async () => {
    const listed = await seed("free"), other = await seed("free");
    await override(listed.orgId, { livePayments: true });
    // Fake key values: only their prefix is read; Stripe is never called.
    Object.assign(process.env, { BILLING_STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_fixture", BILLING_CREDITS_ENABLED: "true",
      LEGAL_ENTITY_NAME: "Fixture Company SL", LEGAL_ENTITY_NIF: "fixture-nif", LEGAL_ENTITY_ADDRESS: "Fixture address" });
    delete process.env.PLANS_V2_ENABLED;
    const before = await resolvePaymentsAccess([listed.orgId, other.orgId], process.env, { pool: runtime });
    expect(before.get(listed.orgId)).toBe("open");
    expect(before.get(other.orgId)).toBe("closed");
    // The scheduler's check for auto-recharge (no legal-entity settings there) follows the same list.
    expect(await paymentsAccessFor(other.orgId, process.env, { requireEntity: false, pool: runtime })).toBe("closed");
    expect(await paymentsAccessFor(listed.orgId, process.env, { requireEntity: false, pool: runtime })).toBe("open");
    // Without the credit layer, nobody.
    process.env.BILLING_CREDITS_ENABLED = "false";
    expect(await paymentsAccessFor(listed.orgId, process.env, { pool: runtime })).toBe("closed");
    // Gate B: everyone.
    Object.assign(process.env, { BILLING_CREDITS_ENABLED: "true", PLANS_V2_ENABLED: "true" });
    const gateB = await resolvePaymentsAccess([listed.orgId, other.orgId], process.env, { pool: runtime });
    expect([...gateB.values()]).toEqual(["open", "open"]);
    // Test mode ignores the live allowlist: only BILLING_TEST_WORKSPACE_IDS.
    Object.assign(process.env, { BILLING_STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fixture", BILLING_TEST_WORKSPACE_IDS: other.orgId });
    const test = await resolvePaymentsAccess([listed.orgId, other.orgId], process.env, { pool: runtime });
    expect([test.get(listed.orgId), test.get(other.orgId)]).toEqual(["closed", "test_workspace"]);
  });

  /* ------------------------------------------------------ typed limits --- */

  it("answers a database plan limit with the generic PLAN_LIMIT while plans v2 is off, and a typed one with it", async () => {
    delete process.env.PLANS_V2_ENABLED;
    const f = await seed("free");
    await addTarget(f);
    const error = await addTarget(f).catch(caught => caught);
    expect(await typedPlanLimit(error)).toBeNull();
    expect(inputError(error)).toMatchObject({ code: "PLAN_LIMIT", status: 403, message: "The free plan includes one AI system. Delete the current one or talk to us about a pilot." });
    await override(f.orgId, { plansV2: true });
    const typed = await typedPlanLimit(error);
    expect(typed).toBeInstanceOf(PlanLimitError);
    expect(typed).toMatchObject({ code: "PLAN_LIMIT_SYSTEMS", status: 403, kind: "systems", orgId: f.orgId, limit: 1 });
    expect(typed!.view()).toEqual({ kind: "systems", limit: 1, connectionType: null });
    // Globally on, without any override.
    process.env.PLANS_V2_ENABLED = "true";
    const g = await seed("free");
    for (let index = 0; index < 3; index++) await addRun(g);
    expect(await typedPlanLimit(await addRun(g).catch(caught => caught))).toMatchObject({ code: "PLAN_LIMIT_RUNS", kind: "runs", limit: 3 });
    // Anything else is not a plan limit.
    expect(await typedPlanLimit(new Error("SCOPE_DENIED"))).toBeNull();
  });

  /* ---------------------------------------------------------- plan summary --- */

  it("summarises the plan for members while plans v2 applies, with the unlocks and the dialog's actions", async () => {
    delete process.env.PLANS_V2_ENABLED;
    Object.assign(process.env, { BILLING_STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fixture", CALCOM_LINK: "caudals/call" });
    const f = await seed("free");
    const viewerId = await user();
    await as(f.ownerId, f.orgId, "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [f.orgId, viewerId]);
    const identity = (id: string, role: "owner" | "viewer"): EvalIdentity => ({ user: { id, name: "Fixture", email: "owner@acme.test" }, platformRole: null,
      workspaces: [{ id: f.orgId, name: "Plans fixture", role }] } as unknown as EvalIdentity);
    // Plans v2 off for the workspace: nothing to show, without a 404 in the member's console (R3); an outsider still gets 404.
    expect(await planSummary(identity(f.ownerId, "owner"), f.orgId)).toBeNull();
    const outsider = await user();
    await expect(planSummary(identity(outsider, "owner"), f.orgId)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    await override(f.orgId, { plansV2: true });
    process.env.BILLING_TEST_WORKSPACE_IDS = f.orgId;
    await addTarget(f);
    await addRun(f);
    await invite(f);
    const summary = (await planSummary(identity(f.ownerId, "owner"), f.orgId))!;
    expect(summary).toMatchObject({
      plan: "free", role: "owner",
      limits: { systems: { used: 1, limit: FREE_LIMITS.systems }, questionsPerSet: { limit: 50 }, runsPerMonth: { used: 1, limit: 3 },
        activeRuns: { limit: 1 }, members: { used: 2, pending: 1, limit: null }, schedules: false },
      unlocks: { systems: "credits", runs: "credits", questions: "credits", schedules: "credits" },
      connectionUnlocks: { imported_responses: "credits", private_runner: "managed", provider_native: "managed" },
      allowance: { monthlyCredits: 1000, granted: false },
      credits: { available: 0, held: 0, billingMode: "free" },
      actions: { addCreditsUrl: `/workspace/billing/top-up?orgId=${f.orgId}`, talkToUsUrl: "https://cal.com/caudals/call" },
    });
    expect(summary.payg).toEqual(PAYG_LIMITS);
    // A viewer sees the plan, not the balance or the top-up.
    const viewer = await planSummary(identity(viewerId, "viewer"), f.orgId);
    expect(viewer).toMatchObject({ role: "viewer", credits: null, actions: { addCreditsUrl: null } });
    // A pay-as-you-go workspace: what is left is unlocked by a managed plan.
    const payg = await seed("payg", { max_systems: 10 });
    await override(payg.orgId, { plansV2: true });
    expect(await planSummary({ ...identity(payg.ownerId, "owner"), workspaces: [{ id: payg.orgId, name: "Plans fixture", role: "owner" }] } as unknown as EvalIdentity, payg.orgId))
      .toMatchObject({ plan: "payg", unlocks: { systems: "managed", members: "managed" } });
  });

  /* ------------------------------------------------- first top-up bonus --- */

  it("gives the larger of the first top-up and pack bonuses, once per tax ID, and a refund does not reopen it", async () => {
    // €500: +20 % (11,000) beats +10 %, never both.
    const big = await withProfile(await seed("free"));
    await tx({ orgId: big.orgId, actorId: WEBHOOK_ACTOR }, db => db.query("SELECT billing.lift_purchase_limits($1,$2)", [big.orgId, "Fixture: a large first pack"]));
    const o = await order(big, 50000);
    expect([o.packBonusUcr, o.firstBonusUcr]).toEqual([c(5000), c(10000)]);
    await pay(big, o);
    expect((await owner.query("SELECT bonus_kind,bonus_ucr::text FROM billing.top_up_order WHERE id=$1", [o.id])).rows[0]).toEqual({ bonus_kind: "first_top_up", bonus_ucr: c(10000).toString() });
    expect((await owner.query("SELECT available_ucr::text FROM billing.credit_account WHERE org_id=$1", [big.orgId])).rows[0].available_ucr).toBe(c(60000).toString());
    // Another workspace of the same company under another domain: the tax ID already had its bonus, so only the pack bonus.
    const sameTax = await withProfile(await seed("free"), { taxId: (await owner.query("SELECT tax_id FROM billing.billing_profile WHERE org_id=$1", [big.orgId])).rows[0].tax_id });
    const second = await order(sameTax, 5000);
    expect(second.firstBonusUcr).toBe(BigInt(0));
    await pay(sameTax, second);
    expect((await owner.query("SELECT bonus_kind,bonus_ucr::text FROM billing.top_up_order WHERE id=$1", [second.id])).rows[0]).toEqual({ bonus_kind: "pack", bonus_ucr: c(150).toString() });
    // A refunded first purchase does not give the bonus again.
    const refunded = await withProfile(await seed("free"));
    const first = await order(refunded);
    await pay(refunded, first);
    const stripe = { refunds: { create: async () => ({ id: rid("re"), status: "succeeded" }) } } as unknown as Stripe;
    await refundTopUp({ orgId: refunded.orgId, orderId: first.id, reason: "Fixture refund within 14 days", actorId: await user(true) }, stripe, runtime);
    expect((await order(refunded)).firstBonusUcr).toBe(BigInt(0));
    expect(await issues(refunded.orgId)).toEqual([]);
  });

  /* -------------------------------------------------------------- rollback --- */

  it("refuses the rollback once a workspace is on payg or an override exists", async () => {
    const sql = readFileSync("db/rollbacks/093_evals_plans_v2_down.sql", "utf8");
    await seed("payg");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/plans v2 rollback refused/);
      await client.query("ROLLBACK").catch(() => undefined);
    } finally { client.release(); }
    expect((await owner.query("SELECT to_regclass('billing.workspace_override') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
