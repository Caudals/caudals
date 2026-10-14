/**
 * The ops billing console on the production schema (migration 094, launch
 * L-16, spec §6.13/§6.15): every action writes its ledger entry and an audit
 * event with before and after values; recent sign-in and platform-admin
 * checks; the two-person rule above 10,000 credits (€100) — the same admin
 * cannot approve, the approver runs the exact payload, the ledger backstop
 * refuses large person-written entries without an approval, requests expire;
 * a money refund above €100 through a second approver (Stripe is a fake);
 * freeze, extend expiry, account view, search, credit usage, the fraud queue
 * and credits per run. The database is scripts/evals/test-db.sh; the file
 * runs on its own copy of it (I-12, tests/helpers/test-database.ts).
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { chargeAction, grantCredits, holdCredits, verifyAccounts } from "../../lib/billing/ledger";
import { createTopUpOrder, saveProfile, type ProfileInput } from "../../lib/billing/payments";
import { settlePayment, WEBHOOK_ACTOR } from "../../lib/billing/settlement";
import { creditsToUcr } from "../../lib/billing/units";
import {
  accountForAdmin, approveForAdmin, closeApprovalForAdmin, creditActionForAdmin, creditUsageForPlatform, extendExpiryForAdmin, fraudQueueForAdmin,
  freezeForAdmin, listApprovalsForAdmin, moneyRefundForAdmin, runCreditsForPlatform, searchAccountsForAdmin,
} from "../../lib/billing/ops";
import { testDatabaseUrls } from "../helpers/test-database";

const { ownerUrl, runtimeUrl } = testDatabaseUrls("billing_ops");
const SCHEDULER = "service:evals-scheduler";
const c = (credits: number) => creditsToUcr(credits);
process.env.BILLING_STRIPE_MODE = "test";

function fakeStripe() {
  const refunds: string[] = [];
  return { refunds, stripe: { refunds: { create: async (params: { payment_intent: string }) => {
    refunds.push(params.payment_intent);
    return { id: `re_${randomUUID().replaceAll("-", "")}`, status: "succeeded", payment_intent: params.payment_intent };
  } } } as unknown as Stripe };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("ops billing console on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 12 });
  const env = { ...process.env };
  beforeAll(() => { process.env.EVALS_DATABASE_URL = runtimeUrl; });
  afterAll(async () => { process.env = env; await Promise.all([owner.end(), runtime.end()]); });

  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  async function user(role: "platform_admin" | "operator" | null = null) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Ops fixture", `${randomUUID()}@example.test`]);
    if (role) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, role]);
    return id;
  }
  async function workspace(plan: "free" | "payg" = "free") {
    const ownerId = await user(), orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [orgId, `Ops fixture ${orgId.slice(0, 6)}`, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    await owner.query(`INSERT INTO evals.workspace_entitlement(org_id,plan,max_active_runs,monthly_spend_limit,currency,allowed_connection_types,can_schedule,can_export,review_allowance,updated_by)
      VALUES($1,$2,1,0,'EUR',ARRAY['website'],false,true,0,'fixture') ON CONFLICT (org_id) DO UPDATE SET plan=EXCLUDED.plan`, [orgId, plan]);
    return { orgId, ownerId };
  }
  const identity = (id: string, platformRole: EvalIdentity["platformRole"] = "platform_admin", minutesAgo = 1): EvalIdentity => ({
    user: { id, email: `${id}@example.test`, name: "Admin" }, platformRole, workspaces: [], sessionCreatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
  const request = (key = randomUUID()) => new Request("https://app.caudals.com/api/evals/v1/billing/admin/x", { method: "POST", headers: { "idempotency-key": key } });
  const audit = async (orgId: string, action: string) => (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action=$2 ORDER BY created_at", [orgId, action])).rows;
  const entries = async (orgId: string) => (await owner.query("SELECT * FROM billing.ledger_entry WHERE org_id=$1 ORDER BY account_version", [orgId])).rows;
  const balance = async (orgId: string) => (await owner.query("SELECT available_ucr::text, held_ucr::text, frozen_reason FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
  const seedGrant = (orgId: string, credits: number) => tx({ orgId, actorId: SCHEDULER }, db => grantCredits(db, { orgId, key: `seed-${randomUUID()}`, amountUcr: c(credits), source: "grant" }));
  const consistent = async (orgId: string) => expect((await tx({ orgId, actorId: SCHEDULER }, db => verifyAccounts(db, orgId)))[0].issues).toEqual([]);

  it("refuses customers, operators and stale sessions; a small grant writes one grant entry and an audit event with before and after", async () => {
    const f = await workspace();
    const admin = await user("platform_admin"), operator = await user("operator");
    const body = { orgId: f.orgId, credits: 250, reason: "Courtesy credit for a broken run", campaign: "support" };
    await expect(creditActionForAdmin(request(), identity(admin, "platform_admin", 30), "grant", body)).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED", status: 403 });
    await expect(creditActionForAdmin(request(), identity(operator, "operator"), "grant", body)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(creditActionForAdmin(request(), identity(f.ownerId, null), "grant", body)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(creditActionForAdmin(request(), identity(admin), "grant", { ...body, reason: "x" })).rejects.toThrow();
    const key = randomUUID();
    const done = await creditActionForAdmin(request(key), identity(admin), "grant", body);
    expect(done).toMatchObject({ outcome: "done", entries: [{ type: "grant", credits: "250", actorId: admin, reason: body.reason }] });
    // A replay with the same Idempotency-Key answers the same and writes nothing more.
    expect(await creditActionForAdmin(request(key), identity(admin), "grant", body)).toEqual(JSON.parse(JSON.stringify(done)));
    const rows = await entries(f.orgId);
    expect(rows).toHaveLength(1);
    const lot = (await owner.query("SELECT source,campaign,expires_at FROM billing.credit_lot WHERE org_id=$1", [f.orgId])).rows[0];
    expect(lot).toMatchObject({ source: "grant", campaign: "support" });
    expect(new Date(lot.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const [event] = await audit(f.orgId, "billing.grant");
    expect(event).toMatchObject({ actor_id: admin, details: { reason: body.reason, before: { available_ucr: 0, held_ucr: 0 }, after: { available_ucr: Number(c(250)) } } });
    await consistent(f.orgId);
  });

  it("adjusts down, reverses an entry and refunds a run's charges, each with its ledger entry and audit event", async () => {
    const f = await workspace();
    const admin = await user("platform_admin");
    await seedGrant(f.orgId, 1000);
    const runId = randomUUID();
    const scope = { orgId: f.orgId, actorId: "service:evals-worker" };
    await tx(scope, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(5), runId }));
    await tx(scope, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(5), runId }));
    expect(await creditActionForAdmin(request(), identity(admin), "adjust", { orgId: f.orgId, credits: -90, reason: "Duplicate courtesy credit" }))
      .toMatchObject({ outcome: "done", entries: [{ type: "adjustment", credits: "-90" }] });
    const refunded = await creditActionForAdmin(request(), identity(admin), "credit_refund", { orgId: f.orgId, runId, reason: "Run failed on our side" });
    expect(refunded).toMatchObject({ outcome: "done", entries: [{ type: "refund", credits: "5" }, { type: "refund", credits: "5" }] });
    await expect(creditActionForAdmin(request(), identity(admin), "credit_refund", { orgId: f.orgId, runId, reason: "Run failed on our side" }))
      .rejects.toMatchObject({ code: "NOTHING_TO_REFUND", status: 409 });
    const grantEntry = (await entries(f.orgId)).find(row => row.entry_type === "grant")!;
    await expect(creditActionForAdmin(request(), identity(admin), "credit_refund", { orgId: f.orgId, entryId: grantEntry.id, reason: "Granted in error" }))
      .rejects.toMatchObject({ code: "REVERSAL_EXCEEDS_REMAINING" });
    const small = await seedGrant(f.orgId, 40);
    expect(await creditActionForAdmin(request(), identity(admin), "credit_refund", { orgId: f.orgId, entryId: small.id, reason: "Granted in error" }))
      .toMatchObject({ outcome: "done", entries: [{ type: "reversal", credits: "-40", reversesEntryId: small.id }] });
    expect((await audit(f.orgId, "billing.adjust")).at(-1)?.details).toMatchObject({ before: { available_ucr: Number(c(990)) }, after: { available_ucr: Number(c(900)) } });
    expect(await audit(f.orgId, "billing.refund_run")).toHaveLength(2);
    expect(await audit(f.orgId, "billing.reverse")).toHaveLength(1);
    expect((await balance(f.orgId)).available_ucr).toBe(String(c(910)));
    await consistent(f.orgId);
  });

  it("needs a second platform admin above 10,000 credits: the requester cannot approve, the approver runs the exact payload", async () => {
    const f = await workspace();
    const [first, second] = [await user("platform_admin"), await user("platform_admin")];
    const body = { orgId: f.orgId, credits: 15_000, reason: "Founding pilot: 5,000 credits × 3 for re-runs", source: "promo" as const };
    const opened = await creditActionForAdmin(request(), identity(first), "grant", body) as { outcome: string; approval: { id: string; payloadSha256: string; status: string; credits: string } };
    expect(opened).toMatchObject({ outcome: "pending_approval", approval: { status: "pending", credits: "15000" } });
    expect(await entries(f.orgId)).toHaveLength(0);
    // Asking again with another key returns the same open request.
    expect(await creditActionForAdmin(request(), identity(first), "grant", body)).toMatchObject({ approval: { id: opened.approval.id } });
    const approve = (who: string, sha = opened.approval.payloadSha256) => approveForAdmin(request(), identity(who), opened.approval.id, { orgId: f.orgId, payloadSha256: sha });
    await expect(approve(first)).rejects.toMatchObject({ code: "APPROVER_MUST_DIFFER", status: 403 });
    await expect(approve(second, "0".repeat(64))).rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
    await expect(approveForAdmin(request(), identity(second, "platform_admin", 30), opened.approval.id, { orgId: f.orgId, payloadSha256: opened.approval.payloadSha256 }))
      .rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expect(await entries(f.orgId)).toHaveLength(0);
    const done = await approve(second);
    expect(done).toMatchObject({ outcome: "done", approval: { status: "executed", approvedBy: second }, entries: [{ type: "grant", credits: "15000", actorId: second }] });
    expect(await approve(second)).toMatchObject({ outcome: "done", approval: { status: "executed" } });
    expect(await entries(f.orgId)).toHaveLength(1);
    const lot = (await owner.query("SELECT source FROM billing.credit_lot WHERE org_id=$1", [f.orgId])).rows[0];
    expect(lot.source).toBe("promo");
    for (const action of ["billing.approval_requested", "billing.approval_approved", "billing.approval_executed", "billing.grant"]) {
      expect(await audit(f.orgId, action), action).toHaveLength(1);
    }
    expect((await audit(f.orgId, "billing.approval_approved"))[0]).toMatchObject({ actor_id: second, details: { requested_by: first, before: { status: "pending" }, after: { status: "approved" } } });
    const listed = await listApprovalsForAdmin(identity(second), new URLSearchParams("status=executed"));
    expect(listed.approvals.some(item => item.id === opened.approval.id)).toBe(true);
    await consistent(f.orgId);
  });

  it("refuses a large person-written credit entry without an approval this person approved (ledger backstop)", async () => {
    const f = await workspace();
    const [first, second] = [await user("platform_admin"), await user("platform_admin")];
    const direct = (actorId: string, key = randomUUID()) => tx({ orgId: f.orgId, actorId }, db => grantCredits(db, { orgId: f.orgId, key, amountUcr: c(20_000), source: "grant", reason: "Bypass attempt" }));
    await expect(direct(first)).rejects.toThrow("SECOND_APPROVER_REQUIRED");
    // An approval approved by someone else does not carry over to this person.
    const opened = await creditActionForAdmin(request(), identity(first), "grant", { orgId: f.orgId, credits: 20_000, reason: "Partner allowance" }) as { approval: { id: string; payloadSha256: string } };
    await expect(tx({ orgId: f.orgId, actorId: first }, async db => {
      await db.query("SELECT set_config('billing.approval_id',$1,true)", [opened.approval.id]);
      return grantCredits(db, { orgId: f.orgId, key: randomUUID(), amountUcr: c(20_000), source: "grant", reason: "Bypass attempt" });
    })).rejects.toThrow("SECOND_APPROVER_REQUIRED");
    // Services (the monthly allowance, purchases) and small entries are not affected.
    await expect(tx({ orgId: f.orgId, actorId: SCHEDULER }, db => grantCredits(db, { orgId: f.orgId, key: randomUUID(), amountUcr: c(20_000), source: "grant" }))).resolves.toBeTruthy();
    await expect(tx({ orgId: f.orgId, actorId: second }, db => grantCredits(db, { orgId: f.orgId, key: randomUUID(), amountUcr: c(10_000), source: "grant", reason: "At the threshold" }))).resolves.toBeTruthy();
    await consistent(f.orgId);
  });

  it("expires requests after 24 hours; the requester cancels, another admin rejects", async () => {
    const f = await workspace();
    const [first, second] = [await user("platform_admin"), await user("platform_admin")];
    const open = async (credits: number) => (await creditActionForAdmin(request(), identity(first), "grant", { orgId: f.orgId, credits, reason: "Large grant fixture" }) as { approval: { id: string; payloadSha256: string } }).approval;
    const expired = await open(11_000);
    const client = await owner.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await client.query("UPDATE billing.approval_request SET requested_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' WHERE id=$1", [expired.id]);
    } finally { await client.query("SET session_replication_role = origin"); client.release(); }
    await expect(approveForAdmin(request(), identity(second), expired.id, { orgId: f.orgId, payloadSha256: expired.payloadSha256 })).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    expect((await listApprovalsForAdmin(identity(second), new URLSearchParams("status=expired"))).approvals.some(item => item.id === expired.id)).toBe(true);
    // A new request for the same payload closes the expired one and opens another.
    const reopened = await open(11_000);
    expect(reopened.id).not.toBe(expired.id);
    expect(await closeApprovalForAdmin(request(), identity(first), reopened.id, { orgId: f.orgId, reason: "Wrong workspace" })).toMatchObject({ status: "cancelled", decidedBy: first });
    const other = await open(12_000);
    expect(await closeApprovalForAdmin(request(), identity(second), other.id, { orgId: f.orgId, reason: "Not agreed with the customer" })).toMatchObject({ status: "rejected", decidedBy: second });
    await expect(approveForAdmin(request(), identity(second), other.id, { orgId: f.orgId, payloadSha256: other.payloadSha256 })).rejects.toMatchObject({ code: "APPROVAL_NOT_PENDING" });
    expect(await entries(f.orgId)).toHaveLength(0);
    // Below the threshold a request is refused: the action runs directly.
    await expect(tx({ orgId: f.orgId, actorId: first }, db => db.query("SELECT * FROM billing.request_approval($1,'grant',$2::bigint,NULL,'{}'::jsonb,'Small grant fixture')", [f.orgId, c(100).toString()])))
      .rejects.toThrow("APPROVAL_NOT_REQUIRED");
  });

  it("refunds a €250 purchase only after a second admin approves; the refund runs as the approver and closes the request", async () => {
    const f = await workspace();
    const [first, second] = [await user("platform_admin"), await user("platform_admin")];
    const profile: ProfileInput = { legalName: "Acme Software SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
      viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1", addressLine2: null,
      postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.test" };
    await tx({ orgId: f.orgId, actorId: f.ownerId }, db => saveProfile(db, f.orgId, profile));
    await tx({ orgId: f.orgId, actorId: SCHEDULER }, db => db.query("SELECT billing.lift_purchase_limits($1,'Fixture: large pack')", [f.orgId]));
    const order = await tx({ orgId: f.orgId, actorId: f.ownerId }, db => createTopUpOrder(db, { orgId: f.orgId, key: `checkout:${randomUUID()}`, netCents: 25_000, livemode: false, buyerDomain: null }));
    const pi = `pi_${randomUUID().replaceAll("-", "")}`;
    await settlePayment({ orgId: f.orgId, orderId: order.id, livemode: false, amountCents: order.grossCents, currency: "eur", paymentIntentId: pi }, WEBHOOK_ACTOR, runtime);
    const { stripe, refunds } = fakeStripe();
    const opened = await moneyRefundForAdmin(request(), identity(first), { orgId: f.orgId, orderId: order.id, reason: "Customer asked within 14 days" }, { stripe }) as { outcome: string; approval: { id: string; payloadSha256: string; netCents: number } };
    expect(opened).toMatchObject({ outcome: "pending_approval", approval: { netCents: 25_000 } });
    expect(refunds).toHaveLength(0);
    await expect(approveForAdmin(request(), identity(first), opened.approval.id, { orgId: f.orgId, payloadSha256: opened.approval.payloadSha256 }, { stripe }))
      .rejects.toMatchObject({ code: "APPROVER_MUST_DIFFER" });
    const done = await approveForAdmin(request(), identity(second), opened.approval.id, { orgId: f.orgId, payloadSha256: opened.approval.payloadSha256 }, { stripe });
    expect(done).toMatchObject({ outcome: "done", approval: { status: "executed", approvedBy: second }, order: { status: "refunded" } });
    expect(refunds).toEqual([pi]);
    const refundEntries = (await entries(f.orgId)).filter(row => row.entry_type === "refund");
    expect(refundEntries.length).toBeGreaterThanOrEqual(1);
    expect(refundEntries.every(row => row.actor_id === second)).toBe(true);
    expect((await balance(f.orgId)).available_ucr).toBe("0");
    expect((await owner.query("SELECT count(*)::int AS n FROM billing.credit_note WHERE order_id=$1", [order.id])).rows[0].n).toBe(1);
    await consistent(f.orgId);
  });

  it("freezes and unfreezes with an audit trail; a frozen account takes no new holds; unfreezing waits for an open dispute", async () => {
    const f = await workspace();
    const admin = await user("platform_admin");
    await seedGrant(f.orgId, 100);
    expect(await freezeForAdmin(request(), identity(admin), { orgId: f.orgId, frozen: true, reason: "Card testing pattern" })).toMatchObject({ frozen: true, frozenReason: "ops: Card testing pattern" });
    await expect(tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => holdCredits(db, { orgId: f.orgId, key: `attempt:${randomUUID()}`, amountUcr: c(1) }))).rejects.toMatchObject({ code: "ACCOUNT_FROZEN" });
    const client = await owner.connect();
    let orderId = "";
    try {
      await client.query("SET session_replication_role = replica");
      orderId = (await client.query(`INSERT INTO billing.top_up_order(org_id,kind,livemode,status,net_cents,vat_rate_bp,vat_cents,gross_cents,tax_treatment,tax_snapshot,base_ucr,pack_bonus_ucr,
          idempotency_key,created_by,paid_at,purchase_entry_id,bonus_ucr,first_paid)
        VALUES($1,'checkout',false,'disputed',2000,0,0,2000,'non_eu_not_subject','{}'::jsonb,2000000000,0,$2,'fixture',now(),$3,0,true) RETURNING id`,
        [f.orgId, `fixture-${randomUUID()}`, randomUUID()])).rows[0].id;
    } finally { await client.query("SET session_replication_role = origin"); client.release(); }
    await expect(freezeForAdmin(request(), identity(admin), { orgId: f.orgId, frozen: false, reason: "Cleared" })).rejects.toMatchObject({ code: "DISPUTE_OPEN" });
    const cleanup = await owner.connect();
    try { await cleanup.query("SET session_replication_role = replica"); await cleanup.query("DELETE FROM billing.top_up_order WHERE id=$1", [orderId]); }
    finally { await cleanup.query("SET session_replication_role = origin"); cleanup.release(); }
    expect(await freezeForAdmin(request(), identity(admin), { orgId: f.orgId, frozen: false, reason: "Cleared after review" })).toMatchObject({ frozen: false, frozenReason: null });
    expect((await audit(f.orgId, "billing.account_frozen"))[0].details).toMatchObject({ reason: "Card testing pattern", before: { frozen_reason: null }, after: { frozen_reason: "ops: Card testing pattern" } });
    expect((await audit(f.orgId, "billing.account_unfrozen"))[0].details).toMatchObject({ before: { frozen_reason: "ops: Card testing pattern" }, after: { frozen_reason: null } });
    await consistent(f.orgId);
  });

  it("extends an unexpired lot's expiry later only, audited, with no ledger entry", async () => {
    const f = await workspace();
    const admin = await user("platform_admin");
    await seedGrant(f.orgId, 100);
    const lot = (await owner.query("SELECT id,expires_at FROM billing.credit_lot WHERE org_id=$1", [f.orgId])).rows[0];
    const later = new Date(new Date(lot.expires_at).getTime() + 30 * 86_400_000).toISOString();
    await expect(extendExpiryForAdmin(request(), identity(admin), { orgId: f.orgId, lotId: lot.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Shorter" }))
      .rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(await extendExpiryForAdmin(request(), identity(admin), { orgId: f.orgId, lotId: lot.id, expiresAt: later, reason: "Pilot delivery moved" })).toMatchObject({ lotId: lot.id, expiresAt: later });
    expect((await audit(f.orgId, "billing.lot_expiry_extended"))[0].details).toMatchObject({ reason: "Pilot delivery moved", after: { expires_at: expect.any(String) } });
    expect(await entries(f.orgId)).toHaveLength(1);
    await consistent(f.orgId);
  });

  it("shows the account view (audited support read), finds accounts, reports credit usage, the fraud queue and run credits", async () => {
    const f = await workspace("payg");
    const admin = await user("platform_admin"), operator = await user("operator");
    await seedGrant(f.orgId, 500);
    const runId = randomUUID();
    await tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "api_question", amountUcr: c(2), runId }));
    const view = await accountForAdmin(identity(admin), f.orgId, new URLSearchParams());
    expect(view.account).toMatchObject({ orgId: f.orgId, plan: "payg", billingMode: "credits", available: "498", issues: [] });
    expect(view.ledger.map(row => row.type)).toEqual(["action", "grant"]);
    expect(view.lots[0]).toMatchObject({ source: "grant", remaining: "498", extendable: true });
    expect(await audit(f.orgId, "support.read")).not.toHaveLength(0);
    const name = (await owner.query("SELECT name FROM evals.workspace WHERE id=$1", [f.orgId])).rows[0].name as string;
    expect((await searchAccountsForAdmin(identity(admin), new URLSearchParams({ q: name }))).accounts.map(row => row.orgId)).toContain(f.orgId);
    await expect(searchAccountsForAdmin(identity(operator, "operator"), new URLSearchParams())).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const usage = await creditUsageForPlatform(identity(operator, "operator"), new URLSearchParams());
    expect(usage.workspaces.find(row => row.orgId === f.orgId)).toMatchObject({ granted: "500", consumed: "2", available: "498" });
    await expect(creditUsageForPlatform(identity(f.ownerId, null), new URLSearchParams())).rejects.toMatchObject({ status: 404 });
    const fraud = await fraudQueueForAdmin(identity(admin), new URLSearchParams("days=30"));
    expect(fraud).toHaveProperty("signups");
    expect(fraud).toHaveProperty("disputes");
    const run = await runCreditsForPlatform(identity(admin), runId, new URLSearchParams({ orgId: f.orgId }));
    expect(run).toMatchObject({ attempts: [], meters: [{ meter: "api_question", count: 1, credits: "2", shadow: false }], totals: { meterCredits: "2" } });
  });
});
