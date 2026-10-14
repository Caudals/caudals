/**
 * The daily reconciliation on the production schema (migration 094, launch
 * L-16, spec §6.13, P-49): clean data (two paid orders, one refunded, their
 * invoices and rectifying invoice, matching Stripe movements) reconciles with
 * zero differences and is stored; injected order, ledger, invoice and Stripe
 * mismatches are flagged with their ids; the admin API reads the stored
 * reports and the clean-day streak and needs a recent sign-in to run one.
 * Stripe is a fake. It reconciles the whole database and leaves injected
 * differences behind, so it runs on its own copy of the database (I-12,
 * tests/helpers/test-database.ts).
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { createTopUpOrder, saveProfile, type ProfileInput } from "../../lib/billing/payments";
import { settlePayment, WEBHOOK_ACTOR } from "../../lib/billing/settlement";
import { refundTopUp } from "../../lib/billing/refunds";
import { runReconciliation } from "../../lib/billing/reconcile";
import { reconciliationForAdmin, runReconciliationForAdmin } from "../../lib/billing/ops-reports";
import type { BalanceTransaction } from "../../lib/billing/invoicing/export";
import { testDatabaseUrls } from "../helpers/test-database";

const { ownerUrl, runtimeUrl } = testDatabaseUrls("reconcile");
const SCHEDULER = "service:evals-scheduler";
process.env.BILLING_STRIPE_MODE = "test";

describe.skipIf(!ownerUrl || !runtimeUrl)("daily reconciliation on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 8 });
  const env = { ...process.env };
  beforeAll(() => { process.env.EVALS_DATABASE_URL = runtimeUrl; });
  afterAll(async () => { process.env = env; await Promise.all([owner.end(), runtime.end()]); });
  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  const today = new Date().toISOString().slice(0, 10);
  const stripeRefunds = { refunds: { create: async (params: { payment_intent: string }) => ({ id: `re_${randomUUID().replaceAll("-", "")}`, status: "succeeded", payment_intent: params.payment_intent }) } } as unknown as Stripe;
  const movements: BalanceTransaction[] = [];
  const now = () => Math.floor(Date.now() / 1000);
  const replica = async (sql: string, params: unknown[]) => {
    const client = await owner.connect();
    try { await client.query("SET session_replication_role = replica"); return await client.query(sql, params); }
    finally { await client.query("SET session_replication_role = origin"); client.release(); }
  };

  async function buyer() {
    const ownerId = createPrefixedId("au"), orgId = randomUUID();
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [ownerId, "Reconcile fixture", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Reconcile fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    const profile: ProfileInput = { legalName: "Acme Software SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
      viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1", addressLine2: null,
      postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.test" };
    await tx({ orgId, actorId: ownerId }, db => saveProfile(db, orgId, profile));
    return { orgId, ownerId };
  }
  async function paid(f: { orgId: string; ownerId: string }, netCents = 2000) {
    const order = await tx({ orgId: f.orgId, actorId: f.ownerId }, db => createTopUpOrder(db, { orgId: f.orgId, key: `checkout:${randomUUID()}`, netCents, livemode: false, buyerDomain: null }));
    const pi = `pi_${randomUUID().replaceAll("-", "")}`;
    await settlePayment({ orgId: f.orgId, orderId: order.id, livemode: false, amountCents: order.grossCents, currency: "eur", paymentIntentId: pi }, WEBHOOK_ACTOR, runtime);
    movements.push({ id: `txn_${randomUUID().slice(0, 8)}`, type: "charge", amount: order.grossCents, fee: 60, net: order.grossCents - 60, currency: "eur", created: now(), sourceId: `ch_${randomUUID().slice(0, 8)}`, paymentIntentId: pi });
    return { ...order, pi };
  }
  const run = (extra: BalanceTransaction[] = [], intentOrders = new Map<string, string>()) =>
    runReconciliation(SCHEDULER, today, false, { pool: runtime, listTransactions: async () => [...movements, ...extra], intentOrders: async () => intentOrders });

  let a: { orgId: string; ownerId: string }, first: Awaited<ReturnType<typeof paid>>, second: Awaited<ReturnType<typeof paid>>;

  it("reconciles clean data with zero differences and stores the report", async () => {
    a = await buyer();
    first = await paid(a);
    second = await paid(a);
    await refundTopUp({ orgId: a.orgId, orderId: second.id, reason: "Customer asked within 14 days", actorId: SCHEDULER }, stripeRefunds, runtime);
    movements.push({ id: `txn_${randomUUID().slice(0, 8)}`, type: "refund", amount: -second.grossCents, fee: 0, net: -second.grossCents, currency: "eur", created: now(), sourceId: null, paymentIntentId: second.pi });
    const report = await run();
    const failing = Object.entries(report.checks).filter(([, check]) => check.count > 0);
    expect(failing).toEqual([]);
    expect(report).toMatchObject({ day: today, livemode: false, discrepancies: 0, stripeChecked: true, stripe: { matched: 3, issues: [], unpaidOrders: [] } });
    const stored = (await owner.query("SELECT discrepancies, stripe_checked FROM billing.reconciliation_report WHERE id=$1", [report.id])).rows[0];
    expect(stored).toEqual({ discrepancies: 0, stripe_checked: true });
    await expect(owner.query("DELETE FROM billing.reconciliation_report WHERE id=$1", [report.id])).rejects.toThrow("LEDGER_APPEND_ONLY");
  });

  it("flags a Stripe payment that never got credits, a movement missing in Stripe and a wrong amount", async () => {
    const pending = await tx({ orgId: a.orgId, actorId: a.ownerId }, db => createTopUpOrder(db, { orgId: a.orgId, key: `checkout:${randomUUID()}`, netCents: 2000, livemode: false, buyerDomain: null }));
    const lost: BalanceTransaction = { id: "txn_lostwebhook", type: "charge", amount: pending.grossCents, fee: 60, net: pending.grossCents - 60, currency: "eur", created: now(), sourceId: "ch_lost", paymentIntentId: "pi_lostwebhook" };
    const report = await run([lost], new Map([["pi_lostwebhook", pending.id]]));
    expect(report.stripe.unpaidOrders).toEqual([{ stripeId: "txn_lostwebhook", orderId: pending.id, status: "pending" }]);
    expect(report.discrepancies).toBe(1);
    const saved = movements.splice(0, 1)[0];
    const missing = await runReconciliation(SCHEDULER, today, false, { pool: runtime, listTransactions: async () => [{ ...movements[0], amount: movements[0].amount - 100 }, ...movements.slice(1)], intentOrders: async () => new Map() });
    expect(missing.stripe.issues.map(item => [item.orderId, item.status]).sort()).toEqual([[first.id, "missing_in_stripe"], [second.id, "amount_mismatch"]].sort());
    movements.unshift(saved);
  });

  it("flags injected order, invoice and ledger mismatches with their ids", async () => {
    // Order ↔ ledger: the paid order points at its bonus entry instead of its purchase.
    const b = await buyer();
    const o = await paid(b, 5000);
    const bonus = (await owner.query("SELECT bonus_entry_id FROM billing.top_up_order WHERE id=$1", [o.id])).rows[0].bonus_entry_id as string;
    expect(bonus).toBeTruthy();
    await replica("UPDATE billing.top_up_order SET purchase_entry_id=$2 WHERE id=$1", [o.id, bonus]);
    // Invoices: the first order's invoice disappears.
    await replica("DELETE FROM billing.invoice WHERE order_id=$1", [first.id]);
    // Ledger: an entry whose amount no longer matches the balance.
    const entry = (await owner.query("SELECT id FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='purchase' ORDER BY created_at LIMIT 1", [a.orgId])).rows[0].id;
    await replica("UPDATE billing.ledger_entry SET amount_ucr=amount_ucr+1000000, available_delta_ucr=available_delta_ucr+1000000 WHERE id=$1", [entry]);
    const report = await run();
    expect(report.checks.paid_order_purchase_mismatch.ids).toContain(o.id);
    expect(report.checks.paid_order_invoice_mismatch.ids).toContain(first.id);
    expect(report.checks.inconsistent_accounts.ids).toContain(a.orgId);
    expect(report.discrepancies).toBeGreaterThanOrEqual(3);
  });

  it("serves stored reports and the streak to platform admins; running one needs a recent sign-in", async () => {
    const admin = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [admin, "Reconcile admin", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [admin]);
    const identity = (minutesAgo: number): EvalIdentity => ({ user: { id: admin, email: "a@example.test", name: "Admin" }, platformRole: "platform_admin", workspaces: [], sessionCreatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() });
    const view = await reconciliationForAdmin(identity(1), new URLSearchParams("mode=test"));
    expect(view.reports.length).toBeGreaterThanOrEqual(3);
    expect(view.report).toMatchObject({ day: today });
    expect(view.streak.days).toBe(0);
    const request = () => new Request("https://app.caudals.com/api/evals/v1/billing/admin/reconciliation", { method: "POST", headers: { "idempotency-key": randomUUID() } });
    await expect(runReconciliationForAdmin(request(), identity(30), {})).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    const ran = await runReconciliationForAdmin(request(), identity(1), {}, { stripe: null });
    expect(ran).toMatchObject({ stripeChecked: false, stripe: { reason: "stripe_unavailable" } });
    await expect(reconciliationForAdmin({ ...identity(1), platformRole: "operator" }, new URLSearchParams())).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });
});
