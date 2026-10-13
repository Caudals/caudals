/**
 * Stripe top-ups on the production schema (migration 091, spec §6.6,
 * §6.14–§6.16): order amounts, purchase limits, idempotent and concurrent
 * webhook processing, out-of-order events, failed payments, refunds,
 * disputes, the first top-up bonus, auto-recharge, RLS and roles. Stripe is
 * a fake object; the database is scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";

const sentEmails = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string; key: string }>);
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: async (message: { to: string; subject: string; text: string }, options: { idempotencyKey: string }) => {
    sentEmails.push({ ...message, key: options.idempotencyKey }); return { data: { id: "email_fixture" }, error: null };
  } } }),
}));
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { chargeAction, holdCredits, grantCredits, verifyAccounts } from "../../lib/billing/ledger";
import {
  beginTopUpRefund, claimAutoRecharge, createTopUpOrder, getOrder, purchaseLimits, recordDispute, saveProfile,
  saveStripeCustomer, setAutoRecharge, type ProfileInput,
} from "../../lib/billing/payments";
import { settlePayment, WEBHOOK_ACTOR } from "../../lib/billing/settlement";
import { handleStripeEvent } from "../../lib/billing/webhook";
import { refundTopUp, RefundError } from "../../lib/billing/refunds";
import { runAutoRecharge } from "../../lib/billing/auto-recharge";
import { creditsToUcr } from "../../lib/billing/units";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";
const c = (credits: number) => creditsToUcr(credits);
const rid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

process.env.ANALYTICS_EVENTS_V2 = "true";
process.env.BILLING_STRIPE_MODE = "test";

function rolePool(url: string, role: string, max: number) {
  const pool = new Pool({ connectionString: url, max });
  pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
  return pool;
}

/** A stand-in for the Stripe client: only the calls the payment code makes. */
function fakeStripe(options: { intents?: Map<string, Partial<Stripe.PaymentIntent>>; charge?: (params: Stripe.PaymentIntentCreateParams, key: string) => Partial<Stripe.PaymentIntent> | Error } = {}) {
  const intents = options.intents ?? new Map<string, Partial<Stripe.PaymentIntent>>();
  const calls = { created: [] as Array<{ params: Stripe.PaymentIntentCreateParams; key: string }>, refunds: [] as string[], defaultPm: [] as string[] };
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => {
        const intent = intents.get(id);
        if (!intent) throw Object.assign(new Error("No such payment_intent"), { type: "StripeInvalidRequestError" });
        return { id, object: "payment_intent", livemode: false, currency: "eur", metadata: {}, ...intent };
      },
      create: async (params: Stripe.PaymentIntentCreateParams, opts: { idempotencyKey: string }) => {
        calls.created.push({ params, key: opts.idempotencyKey });
        const result = options.charge?.(params, opts.idempotencyKey) ?? { status: "succeeded" };
        if (result instanceof Error) throw result;
        const intent = { id: rid("pi"), object: "payment_intent", livemode: false, amount: params.amount, amount_received: result.status === "succeeded" ? params.amount : 0, currency: "eur", metadata: params.metadata, ...result };
        intents.set(intent.id as string, intent as Partial<Stripe.PaymentIntent>);
        return intent;
      },
    },
    customers: {
      update: async (id: string, params: { invoice_settings?: { default_payment_method?: string } }) => { if (params.invoice_settings?.default_payment_method) calls.defaultPm.push(params.invoice_settings.default_payment_method); return { id }; },
      retrieve: async (id: string) => ({ id, deleted: false, invoice_settings: { default_payment_method: null } }),
    },
    paymentMethods: { list: async () => ({ data: [{ id: "pm_1CardSaved1234" }] }) },
    refunds: { create: async (params: { payment_intent: string }, opts: { idempotencyKey: string }) => { calls.refunds.push(opts.idempotencyKey); return { id: rid("re"), status: "succeeded", payment_intent: params.payment_intent }; } },
    checkout: { sessions: { retrieve: async () => { throw new Error("not used"); } } },
  };
  return { stripe: stripe as unknown as Stripe, intents, calls };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("Stripe top-ups on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 20 });
  const worker = rolePool(ownerUrl!, "evals_worker", 2);
  afterAll(async () => { await Promise.all([owner, runtime, worker].map(pool => pool.end())); });

  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  const system = (orgId: string) => ({ orgId, actorId: WEBHOOK_ACTOR });

  async function user(platformAdmin = false) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Payments fixture", `${randomUUID()}@example.test`]);
    if (platformAdmin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    return id;
  }
  async function seed(profileOverrides: Partial<ProfileInput> | null = {}) {
    const ownerId = await user(), editorId = await user(), orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Payments fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')", [orgId, ownerId, editorId]);
    const customer = { orgId, actorId: ownerId };
    if (profileOverrides) await tx(customer, db => saveProfile(db, orgId, profile(profileOverrides)));
    return { orgId, ownerId, editorId, customer, domain: `acme-${randomUUID().slice(0, 8)}.test` };
  }
  const profile = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    legalName: "Acme Software SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
    viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1",
    addressLine2: null, postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.test", ...overrides,
  });
  const order = (f: Awaited<ReturnType<typeof seed>>, netCents = 2000, key = `checkout:${randomUUID()}`, domain: string | null = f.domain) =>
    tx(f.customer, db => createTopUpOrder(db, { orgId: f.orgId, key, netCents, livemode: false, buyerDomain: domain }));
  const balance = async (orgId: string) => {
    const row = (await owner.query("SELECT available_ucr,held_ucr,frozen_reason FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
    return { available: BigInt(row.available_ucr), held: BigInt(row.held_ucr), frozen: row.frozen_reason as string | null };
  };
  const issues = async (orgId: string) => (await tx(system(orgId), db => verifyAccounts(db, orgId)))[0].issues;
  const entries = async (orgId: string, type?: string) => Number((await owner.query(
    "SELECT count(*) FROM billing.ledger_entry WHERE org_id=$1 AND ($2::text IS NULL OR entry_type=$2)", [orgId, type ?? null])).rows[0].count);
  const reload = (orgId: string, id: string) => tx(system(orgId), db => getOrder(db, orgId, id));

  function event(type: string, object: Record<string, unknown>, id = rid("evt")) {
    return { id, object: "event", type, livemode: false, api_version: "2025-09-30.clover", created: Math.floor(Date.now() / 1000), data: { object } } as unknown as Stripe.Event;
  }
  function completed(o: { id: string; orgId: string; grossCents: number }, pi = rid("pi"), customer = rid("cus"), extra: Record<string, unknown> = {}) {
    return event("checkout.session.completed", {
      id: rid("cs_test"), object: "checkout.session", mode: "payment", livemode: false, metadata: { kind: "top_up", order_id: o.id, org_id: o.orgId },
      payment_status: "paid", status: "complete", payment_intent: pi, amount_total: o.grossCents, currency: "eur", customer,
      customer_details: { address: { country: "ES" }, tax_ids: [] }, ...extra,
    });
  }
  const ctx = (stripe: Stripe) => ({ stripe, livemode: false, pool: runtime });
  const raw = (e: Stripe.Event) => JSON.stringify(e);

  /* ----------------------------------------------------- profiles, orders --- */

  it("derives every amount in the database: 21 % IVA, the pack and the first top-up bonus", async () => {
    const f = await seed();
    const o = await order(f, 5000);
    expect(o).toMatchObject({ status: "pending", netCents: 5000, vatRateBp: 2100, vatCents: 1050, grossCents: 6050, taxTreatment: "es_vat",
      baseUcr: c(5000), packBonusUcr: c(150), firstBonusUcr: c(1000) });
    expect(o.taxSnapshot).toMatchObject({ legal_name: "Acme Software SL", country: "ES", billing_email: "billing@acme.test" });
    const eu = await seed({ country: "FR", taxId: "FR12345678901", taxIdKind: "eu_vat", viesStatus: "valid", taxTreatment: "eu_reverse_charge" });
    expect(await order(eu, 2000)).toMatchObject({ vatCents: 0, grossCents: 2000, taxTreatment: "eu_reverse_charge" });
    const us = await seed({ country: "US", taxId: "EIN123456789", taxIdKind: "non_eu_business", taxTreatment: "non_eu_not_subject" });
    expect(await order(us, 2000)).toMatchObject({ vatCents: 0, grossCents: 2000, taxTreatment: "non_eu_not_subject" });
    // Unknown packs and incoherent treatments never reach the table.
    await expect(order(f, 3000)).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(tx(f.customer, db => saveProfile(db, f.orgId, profile({ taxTreatment: "eu_reverse_charge" })))).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(tx(f.customer, db => saveProfile(db, f.orgId, profile({ country: "DE", taxIdKind: "eu_vat", viesStatus: "invalid", taxTreatment: "eu_reverse_charge" }))))
      .rejects.toMatchObject({ code: "INPUT_INVALID" });
  });

  it("is owner-only, idempotent by key, and needs a reviewed profile on an unfrozen account", async () => {
    const f = await seed();
    await expect(tx({ orgId: f.orgId, actorId: f.editorId }, db => createTopUpOrder(db, { orgId: f.orgId, key: "checkout:editor", netCents: 2000, livemode: false, buyerDomain: null })))
      .rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(tx({ orgId: f.orgId, actorId: f.editorId }, db => saveProfile(db, f.orgId, profile()))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const key = `checkout:${randomUUID()}`;
    const first = await order(f, 2000, key);
    expect((await order(f, 2000, key)).id).toBe(first.id);
    await expect(order(f, 5000, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const none = await seed(null);
    await expect(order(none)).rejects.toMatchObject({ code: "BILLING_PROFILE_REQUIRED" });
    const review = await seed({ country: "IT", taxId: "IT12345678901", taxIdKind: "eu_vat", viesStatus: "unavailable", taxTreatment: null, taxReviewReason: "vies_unavailable" });
    await expect(order(review)).rejects.toMatchObject({ code: "TAX_REVIEW_REQUIRED" });
    await owner.query("UPDATE billing.credit_account SET frozen_reason='dispute:dp_fixture' WHERE org_id=$1", [f.orgId]);
    await expect(order(f)).rejects.toMatchObject({ code: "ACCOUNT_FROZEN" });
    // The profile change is audited.
    expect(Number((await owner.query("SELECT count(*) FROM evals.audit_event WHERE org_id=$1 AND action='billing.profile_saved'", [f.orgId])).rows[0].count)).toBe(1);
  });

  it("limits new accounts to €100 and 3 top-ups a day; stale checkouts expire; ops can lift the limits", async () => {
    const f = await seed();
    await order(f, 10000);
    await expect(order(f, 2000)).rejects.toMatchObject({ code: "PURCHASE_LIMIT" });
    const g = await seed();
    for (let i = 0; i < 3; i++) await order(g, 2000);
    await expect(order(g, 2000)).rejects.toMatchObject({ code: "PURCHASE_RATE_LIMIT" });
    expect(await tx(g.customer, db => purchaseLimits(db, g.orgId))).toEqual({ isNew: true, windowNetCents: 6000, recentCount: 3, lifted: false });
    // A checkout whose session lapsed no longer counts.
    await owner.query("UPDATE billing.top_up_order SET stripe_checkout_session_id='cs_test_'||replace(id::text,'-',''), checkout_expires_at=now()-interval '1 hour' WHERE org_id=$1", [f.orgId]);
    expect(await order(f, 2000)).toMatchObject({ status: "pending" });
    expect(Number((await owner.query("SELECT count(*) FROM billing.top_up_order WHERE org_id=$1 AND status='expired'", [f.orgId])).rows[0].count)).toBe(1);
    await tx(system(g.orgId), db => db.query("SELECT billing.lift_purchase_limits($1,'Known customer, verified by phone')", [g.orgId]));
    expect(await order(g, 50000)).toMatchObject({ status: "pending" });
  });

  /* --------------------------------------------------------- the webhook --- */

  it("a test-mode purchase makes credits available once, however often the event arrives", async () => {
    const f = await seed();
    await owner.query("UPDATE evals.workspace SET acquisition_attribution='{\"utm_source\":\"linkedin\",\"utm_campaign\":\"launch\"}'::jsonb WHERE id=$1", [f.orgId]);
    const o = await order(f, 2000);
    const customer = rid("cus");
    await tx(f.customer, db => saveStripeCustomer(db, f.orgId, false, customer));
    const pi = rid("pi");
    const { stripe, intents, calls } = fakeStripe();
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents, payment_method: "pm_1CardVisa1234", setup_future_usage: "off_session",
      latest_charge: { id: rid("ch"), payment_method_details: { card: { brand: "visa", last4: "4242", country: "ES" } } } as unknown as Stripe.Charge });
    const e = completed(o, pi, customer);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await handleStripeEvent(e, raw(e), ctx(stripe)));
    expect(results.map(r => r.outcome)).toEqual(["purchase_recorded", "replay", "replay", "replay", "replay"]);
    expect(await entries(f.orgId, "purchase")).toBe(1);
    expect(await entries(f.orgId, "bonus")).toBe(1);
    expect(await balance(f.orgId)).toMatchObject({ available: c(2400), held: BigInt(0) });
    const paid = await reload(f.orgId, o.id);
    expect(paid).toMatchObject({ status: "paid", bonusUcr: c(400), bonusKind: "first_top_up", firstPaid: true, paymentIntentId: pi, cardCountry: "ES" });
    expect(paid?.attribution).toEqual({ utm_source: "linkedin", utm_campaign: "launch" });
    // The purchase lot carries the euro price paid per credit; the bonus lot has none. Both last 24 months.
    const lots = (await owner.query("SELECT source,unit_price_eur::text AS price,expires_at FROM billing.credit_lot WHERE org_id=$1 ORDER BY source DESC", [f.orgId])).rows;
    expect(lots.map(l => [l.source, l.price])).toEqual([["purchase", "0.0100000000"], ["bonus", "0.0000000000"]]);
    expect(new Date(lots[0].expires_at).getTime() - Date.now()).toBeGreaterThan(729 * 86_400_000);
    // The card is saved for auto-recharge and made the customer's default.
    expect((await owner.query("SELECT payment_method_id,card_last4 FROM billing.stripe_customer WHERE org_id=$1", [f.orgId])).rows[0]).toEqual({ payment_method_id: "pm_1CardVisa1234", card_last4: "4242" });
    expect(calls.defaultPm).toEqual(["pm_1CardVisa1234"]);
    // payment_intent.succeeded for the same payment is one more report of it.
    const succeeded = event("payment_intent.succeeded", { id: pi, object: "payment_intent", livemode: false, amount_received: o.grossCents, currency: "eur", metadata: { order_id: o.id }, customer });
    expect((await handleStripeEvent(succeeded, raw(succeeded), ctx(stripe))).outcome).toBe("purchase_recorded");
    expect(await entries(f.orgId, "purchase")).toBe(1);
    const stored = (await owner.query("SELECT status,deliveries,org_id FROM billing.stripe_event WHERE id=$1", [e.id])).rows[0];
    expect(stored).toEqual({ status: "processed", deliveries: 5, org_id: f.orgId });
    const analytics = (await owner.query("SELECT metadata,attribution FROM public.product_analytics_event WHERE org_id=$1 AND event_name='top_up_paid'", [f.orgId])).rows;
    expect(analytics).toEqual([{ metadata: { pack: "eur_20", net_amount: 20, first_purchase: true }, attribution: { utm_source: "linkedin", utm_campaign: "launch" } }]);
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("concurrent deliveries and a racing return-page sync still produce one purchase", async () => {
    const f = await seed();
    const o = await order(f, 5000);
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents });
    const e = completed(o, pi);
    const outcomes = await Promise.all([
      ...Array.from({ length: 5 }, () => handleStripeEvent(e, raw(e), ctx(stripe))),
      ...Array.from({ length: 5 }, () => settlePayment({ orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: pi }, "system:stripe-sync", runtime)),
    ]);
    expect(outcomes.filter(r => "status" in r && r.status !== 200)).toEqual([]);
    expect(await entries(f.orgId, "purchase")).toBe(1);
    expect(await entries(f.orgId, "bonus")).toBe(1);
    expect(await balance(f.orgId)).toMatchObject({ available: c(6000) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("a failed payment adds nothing; a failure reported after the success changes nothing", async () => {
    const f = await seed();
    const o = await order(f);
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    const failed = event("payment_intent.payment_failed", { id: pi, object: "payment_intent", livemode: false, status: "requires_payment_method", metadata: { order_id: o.id },
      last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" } });
    expect((await handleStripeEvent(failed, raw(failed), ctx(stripe))).outcome).toBe("payment_failed");
    expect(await reload(f.orgId, o.id)).toMatchObject({ status: "pending", failureCode: "insufficient_funds", failureCount: 1 });
    expect(await entries(f.orgId)).toBe(0);
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents });
    const ok = completed(o, pi);
    await handleStripeEvent(ok, raw(ok), ctx(stripe));
    const late = event("payment_intent.payment_failed", { id: pi, object: "payment_intent", livemode: false, status: "requires_payment_method", metadata: { order_id: o.id } });
    await handleStripeEvent(late, raw(late), ctx(stripe));
    expect(await reload(f.orgId, o.id)).toMatchObject({ status: "paid" });
    expect(await balance(f.orgId)).toMatchObject({ available: c(2400) });
  });

  it("rejects events of the other mode and payments that do not match the order", async () => {
    const f = await seed();
    const o = await order(f);
    const { stripe } = fakeStripe();
    const live = { ...completed(o), livemode: true } as Stripe.Event;
    expect(await handleStripeEvent(live, raw(live), ctx(stripe))).toEqual({ status: 400, outcome: "mode_mismatch" });
    const wrong = completed({ ...o, grossCents: 1 });
    expect(await handleStripeEvent(wrong, raw(wrong), ctx(stripe))).toMatchObject({ status: 200, outcome: "payment_mismatch" });
    expect(await entries(f.orgId)).toBe(0);
    expect((await owner.query("SELECT status,outcome FROM billing.stripe_event WHERE id=$1", [wrong.id])).rows[0]).toEqual({ status: "failed", outcome: "payment_mismatch" });
    // Out of the health alerts' one-hour window, so a parallel health-alert fixture sees a quiet database.
    await owner.query("UPDATE billing.stripe_event SET received_at=now()-interval '2 hours', last_received_at=now()-interval '2 hours' WHERE id=$1", [wrong.id]);
    const stranger = event("payment_intent.succeeded", { id: rid("pi"), object: "payment_intent", livemode: false, amount_received: 100, currency: "eur", metadata: {} });
    const unknown = fakeStripe();
    unknown.intents.set((stranger.data.object as { id: string }).id, { status: "succeeded", metadata: {} });
    expect(await handleStripeEvent(stranger, raw(stranger), ctx(unknown.stripe))).toMatchObject({ status: 200, outcome: "unknown_order" });
  });

  it("handles a refund that arrives before the payment event, and the late payment event is a replay", async () => {
    const f = await seed();
    const o = await order(f);
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents, metadata: { order_id: o.id } });
    const refunded = event("charge.refunded", { id: rid("ch"), object: "charge", livemode: false, payment_intent: pi, amount: o.grossCents, amount_refunded: o.grossCents, refunds: { data: [{ id: rid("re") }] } });
    expect((await handleStripeEvent(refunded, raw(refunded), ctx(stripe))).outcome).toBe("refund_recorded");
    expect(await reload(f.orgId, o.id)).toMatchObject({ status: "refunded" });
    expect(await balance(f.orgId)).toMatchObject({ available: BigInt(0) });
    const late = completed(o, pi);
    expect((await handleStripeEvent(late, raw(late), ctx(stripe))).outcome).toBe("purchase_recorded");
    expect(await entries(f.orgId, "purchase")).toBe(1);
    expect(await balance(f.orgId)).toMatchObject({ available: BigInt(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("defers a dispute for an order Stripe has not reported paid, then applies it on redelivery", async () => {
    const f = await seed();
    const o = await order(f);
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    intents.set(pi, { status: "processing", metadata: { order_id: o.id } });
    const dispute = event("charge.dispute.created", { id: rid("dp"), object: "dispute", livemode: false, payment_intent: pi, charge: rid("ch"), status: "needs_response", amount: o.grossCents });
    expect(await handleStripeEvent(dispute, raw(dispute), ctx(stripe))).toMatchObject({ status: 503, outcome: "order_not_paid" });
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents, metadata: { order_id: o.id } });
    expect((await handleStripeEvent(dispute, raw(dispute), ctx(stripe))).outcome).toBe("dispute_opened");
    expect(await reload(f.orgId, o.id)).toMatchObject({ status: "disputed" });
    expect((await balance(f.orgId)).frozen).toMatch(/^dispute:dp_/);
  });

  it("emails one receipt with its fiscal lines, only to Caudals' own address in test mode", async () => {
    process.env.COLLABORATION_NOTIFICATION_EMAIL = "team@internal.example";
    process.env.RESEND_FROM_EMAIL = "billing@caudals.com";
    const f = await seed({ billingEmail: "team@internal.example" });
    const o = await order(f);
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents,
      latest_charge: { id: rid("ch"), payment_method_details: { card: { brand: "visa", last4: "4242", country: "ES" } } } as unknown as Stripe.Charge });
    const before = sentEmails.length;
    const e = completed(o, pi);
    await handleStripeEvent(e, raw(e), ctx(stripe));
    const succeeded = event("payment_intent.succeeded", { id: pi, object: "payment_intent", livemode: false, amount_received: o.grossCents, currency: "eur", metadata: { order_id: o.id } });
    await handleStripeEvent(succeeded, raw(succeeded), ctx(stripe));
    const sent = sentEmails.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "team@internal.example", subject: "Justificante de tus créditos de Caudals", key: `billing-receipt:${o.id}:0` });
    for (const line of ["Importe pagado", "24,20", "2400", "Créditos de bonificación incluidos", "Importe sin IVA", "IVA (21 %)", "4,20", "Visa acabada en 4242", "24 meses"]) {
      expect(sent[0].text).toContain(line);
    }
    // A customer address is never emailed in test mode.
    const g = await seed();
    const other = await order(g);
    await settlePayment({ orgId: g.orgId, orderId: other.id, livemode: false, amountCents: other.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    const { sendReceipt } = await import("../../lib/billing/emails");
    expect(await sendReceipt((await reload(g.orgId, other.id))!, null, runtime)).toBe("skipped");
    expect(sentEmails.length).toBe(before + 1);
  });

  /* -------------------------------------------------- refunds, disputes --- */

  it("refunds an untouched purchase within 14 days: ledger refund, then a Stripe refund", async () => {
    const admin = await user(true);
    const f = await seed();
    const o = await order(f);
    const pi = rid("pi");
    await settlePayment({ orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: pi }, WEBHOOK_ACTOR, runtime);
    const { stripe, calls } = fakeStripe();
    // Reason required for a person.
    await expect(refundTopUp({ orgId: f.orgId, orderId: o.id, reason: " ", actorId: admin }, stripe, runtime)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    // Customers cannot refund themselves.
    await expect(tx(f.customer, db => beginTopUpRefund(db, { orgId: f.orgId, orderId: o.id, reason: "Changed my mind" }))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const done = await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, stripe, runtime);
    expect(done).toMatchObject({ status: "refunded" });
    expect(calls.refunds).toEqual([`refund:${o.id}`]);
    const refunds = (await owner.query("SELECT amount_ucr::text,reverses_entry_id IS NOT NULL AS reverses,reason FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='refund' ORDER BY account_version", [f.orgId])).rows;
    expect(refunds).toEqual([{ amount_ucr: (-c(2000)).toString(), reverses: true, reason: "Customer asked within 14 days" },
      { amount_ucr: (-c(400)).toString(), reverses: true, reason: "Customer asked within 14 days" }]);
    expect(await balance(f.orgId)).toMatchObject({ available: BigInt(0) });
    expect(Number((await owner.query("SELECT count(*) FROM evals.audit_event WHERE org_id=$1 AND action='billing.top_up_refund'", [f.orgId])).rows[0].count)).toBe(2);
    // Replays and the charge.refunded webhook change nothing.
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, stripe, runtime);
    const webhook = event("charge.refunded", { id: rid("ch"), object: "charge", livemode: false, payment_intent: pi, amount_refunded: o.grossCents });
    await handleStripeEvent(webhook, raw(webhook), ctx(stripe));
    expect(await entries(f.orgId, "refund")).toBe(2);
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("refuses refunds of touched or old purchases and, until L-16, above €100", async () => {
    const admin = await user(true);
    const f = await seed();
    const touched = await order(f);
    await settlePayment({ orgId: f.orgId, orderId: touched.id, livemode: false, amountCents: touched.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    await tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(5) }));
    const { stripe } = fakeStripe();
    await expect(refundTopUp({ orgId: f.orgId, orderId: touched.id, reason: "Asked for a refund", actorId: admin }, stripe, runtime)).rejects.toMatchObject({ code: "REFUND_NOT_ALLOWED" });
    const g = await seed();
    const old = await order(g);
    await settlePayment({ orgId: g.orgId, orderId: old.id, livemode: false, amountCents: old.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    await owner.query("UPDATE billing.top_up_order SET paid_at=now()-interval '15 days' WHERE id=$1", [old.id]);
    await expect(refundTopUp({ orgId: g.orgId, orderId: old.id, reason: "Asked for a refund", actorId: admin }, stripe, runtime)).rejects.toMatchObject({ code: "REFUND_NOT_ALLOWED" });
    const h = await seed();
    await tx(system(h.orgId), db => db.query("SELECT billing.lift_purchase_limits($1,'Fixture: large pack')", [h.orgId]));
    const big = await order(h, 25000);
    await expect(refundTopUp({ orgId: h.orgId, orderId: big.id, reason: "Asked for a refund", actorId: admin }, stripe, runtime)).rejects.toBeInstanceOf(RefundError);
  });

  it("freezes on a dispute, unfreezes when it is won, and a lost one charges back what is left", async () => {
    const f = await seed();
    const first = await order(f);
    await settlePayment({ orgId: f.orgId, orderId: first.id, livemode: false, amountCents: first.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    const dp = rid("dp");
    await tx(system(f.orgId), db => recordDispute(db, { orgId: f.orgId, orderId: first.id, disputeId: dp, status: "needs_response" }));
    expect((await balance(f.orgId)).frozen).toBe(`dispute:${dp}`);
    await expect(tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => holdCredits(db, { orgId: f.orgId, key: `attempt:${randomUUID()}`, amountUcr: c(1) })))
      .rejects.toMatchObject({ code: "ACCOUNT_FROZEN" });
    await expect(order(f)).rejects.toMatchObject({ code: "ACCOUNT_FROZEN" });
    await tx(system(f.orgId), db => recordDispute(db, { orgId: f.orgId, orderId: first.id, disputeId: dp, status: "won" }));
    expect(await balance(f.orgId)).toMatchObject({ frozen: null, available: c(2400) });
    expect(await reload(f.orgId, first.id)).toMatchObject({ status: "paid" });
    // Spend some, then lose a dispute (closed arrives without the created event).
    await tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(500) }));
    const lost = rid("dp");
    await tx(system(f.orgId), db => recordDispute(db, { orgId: f.orgId, orderId: first.id, disputeId: lost, status: "lost" }));
    expect(await balance(f.orgId)).toMatchObject({ available: BigInt(0), frozen: `chargeback:${lost}` });
    const chargeback = (await owner.query("SELECT amount_ucr::text,metadata FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='chargeback'", [f.orgId])).rows;
    expect(chargeback).toEqual([{ amount_ucr: (-c(1900)).toString(), metadata: { dispute: lost, shortfall_ucr: Number(c(500)) } }]);
    expect(await reload(f.orgId, first.id)).toMatchObject({ status: "charged_back", riskFlags: ["chargeback_shortfall"] });
    // Replaying the closed event changes nothing.
    await tx(system(f.orgId), db => recordDispute(db, { orgId: f.orgId, orderId: first.id, disputeId: lost, status: "lost" }));
    expect(await entries(f.orgId, "chargeback")).toBe(1);
    expect(await issues(f.orgId)).toEqual([]);
  });

  /* ----------------------------------------------------- first top-up bonus --- */

  it("gives the +20 % first top-up bonus once per workspace and once per company domain", async () => {
    const a = await seed();
    const one = await order(a), two = await order(a);
    expect(one.firstBonusUcr).toBe(c(400));
    expect(two.firstBonusUcr).toBe(c(400));
    await Promise.all([one, two].map(o => settlePayment({ orgId: a.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime)));
    const kinds = (await owner.query("SELECT bonus_kind,bonus_ucr::text FROM billing.top_up_order WHERE org_id=$1 ORDER BY bonus_kind NULLS LAST", [a.orgId])).rows;
    expect(kinds).toEqual([{ bonus_kind: "first_top_up", bonus_ucr: c(400).toString() }, { bonus_kind: null, bonus_ucr: "0" }]);
    // Another workspace of the same company: no first bonus offered, the pack bonus applies.
    const b = await seed();
    const sameDomain = await order(b, 5000, `checkout:${randomUUID()}`, a.domain);
    expect(sameDomain.firstBonusUcr).toBe(BigInt(0));
    await settlePayment({ orgId: b.orgId, orderId: sameDomain.id, livemode: false, amountCents: sameDomain.grossCents, currency: "eur", paymentIntentId: rid("pi") }, WEBHOOK_ACTOR, runtime);
    expect(await reload(b.orgId, sameDomain.id)).toMatchObject({ bonusKind: "pack", bonusUcr: c(150) });
    expect(await issues(a.orgId)).toEqual([]);
  });

  /* ---------------------------------------------------------- auto-recharge --- */

  it("auto-recharges once per threshold crossing with the crossing in the idempotency key, and respects the monthly cap", async () => {
    const f = await seed();
    await tx(system(f.orgId), db => db.query("SELECT billing.lift_purchase_limits($1,'Fixture: auto-recharge')", [f.orgId]));
    const customer = rid("cus");
    await tx(f.customer, db => saveStripeCustomer(db, f.orgId, false, customer));
    await owner.query("UPDATE billing.stripe_customer SET payment_method_id='pm_1CardSaved1234' WHERE org_id=$1", [f.orgId]);
    await tx(f.customer, db => setAutoRecharge(db, f.orgId, { enabled: true, thresholdUcr: c(500), packCents: 2000, monthlyMaxCount: 2, monthlyMaxCents: 30000 }));
    const { stripe, calls } = fakeStripe();
    const run = () => runAutoRecharge(SCHEDULER, { stripe, pool: runtime, allowed: id => id === f.orgId });
    // Balance 0 < 500: one recharge.
    expect(await run()).toMatchObject({ succeeded: 1 });
    expect(await balance(f.orgId)).toMatchObject({ available: c(2400) });
    expect(calls.created.map(call => call.key)).toEqual([`auto-recharge:${f.orgId}:1:1`]);
    expect(calls.created[0].params).toMatchObject({ off_session: true, confirm: true, amount: 2420, payment_method: "pm_1CardSaved1234", customer });
    // Above the threshold nothing happens; the next pass re-arms.
    await run(); await run();
    expect(calls.created).toHaveLength(1);
    // Spend below the threshold: crossing 2.
    await tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(2000) }));
    await run(); await run();
    expect(calls.created.map(call => call.key)).toEqual([`auto-recharge:${f.orgId}:1:1`, `auto-recharge:${f.orgId}:2:1`]);
    // Third crossing in the month: the cap (2 recharges) stops it and records an alert.
    await tx({ orgId: f.orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: f.orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(2400) }));
    await run(); await run();
    expect(calls.created).toHaveLength(2);
    expect(Number((await owner.query("SELECT count(*) FROM billing.alert_state WHERE org_id=$1 AND kind='auto_recharge_cap'", [f.orgId])).rows[0].count)).toBe(1);
    const events = (await owner.query("SELECT count(*)::int AS n FROM public.product_analytics_event WHERE org_id=$1 AND event_name='auto_recharge_paid'", [f.orgId])).rows[0].n;
    expect(events).toBe(2);
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("keeps one recharge in flight, retries once after 24 h and then switches off", async () => {
    const f = await seed();
    const customer = rid("cus");
    await tx(f.customer, db => saveStripeCustomer(db, f.orgId, false, customer));
    await owner.query("UPDATE billing.stripe_customer SET payment_method_id='pm_1CardSaved1234' WHERE org_id=$1", [f.orgId]);
    await tx(f.customer, db => setAutoRecharge(db, f.orgId, { enabled: true, thresholdUcr: c(500), packCents: 2000, monthlyMaxCount: 3, monthlyMaxCents: 30000 }));
    // Claiming twice in a row hands out one order.
    const claimed = await tx({ orgId: f.orgId, actorId: SCHEDULER }, db => claimAutoRecharge(db, f.orgId, false));
    expect(claimed).toMatchObject({ kind: "auto_recharge", autoRechargeCrossing: 1, autoRechargeAttempt: 1 });
    expect(await tx({ orgId: f.orgId, actorId: SCHEDULER }, db => claimAutoRecharge(db, f.orgId, false))).toBeNull();
    // Resumed after 2 minutes with the same key; the card is declined.
    await owner.query("UPDATE billing.top_up_order SET updated_at=now()-interval '3 minutes' WHERE id=$1", [claimed!.id]);
    const cardError = new Stripe.errors.StripeCardError({ message: "Your card was declined.", code: "card_declined", type: "card_error" } as never);
    const { stripe, calls } = fakeStripe({ charge: () => cardError });
    const run = () => runAutoRecharge(SCHEDULER, { stripe, pool: runtime, allowed: id => id === f.orgId });
    expect(await run()).toMatchObject({ failed: 1 });
    expect(calls.created.map(call => call.key)).toEqual([`auto-recharge:${f.orgId}:1:1`]);
    expect(await reload(f.orgId, claimed!.id)).toMatchObject({ status: "failed", failureCode: "card_declined" });
    expect((await owner.query("SELECT failures,enabled,retry_after > now() + interval '23 hours' AS later FROM billing.auto_recharge WHERE org_id=$1", [f.orgId])).rows[0])
      .toEqual({ failures: 1, enabled: true, later: true });
    expect((await owner.query("SELECT kind FROM evals.notification WHERE org_id=$1", [f.orgId])).rows).toEqual([{ kind: "auto_recharge_failed" }]);
    // No retry before 24 h.
    await run();
    expect(calls.created).toHaveLength(1);
    await owner.query("UPDATE billing.auto_recharge SET retry_after=now()-interval '1 minute' WHERE org_id=$1", [f.orgId]);
    await run();
    expect(calls.created.map(call => call.key)).toEqual([`auto-recharge:${f.orgId}:1:1`, `auto-recharge:${f.orgId}:1:2`]);
    expect((await owner.query("SELECT failures,enabled,disabled_reason FROM billing.auto_recharge WHERE org_id=$1", [f.orgId])).rows[0])
      .toEqual({ failures: 2, enabled: false, disabled_reason: "payment_failed" });
    await run();
    expect(calls.created).toHaveLength(2);
    expect(await entries(f.orgId)).toBe(0);
  });

  /* -------------------------------------------------------- isolation, roles --- */

  it("keeps payments data per workspace and recording to services and admins", async () => {
    const f = await seed(), g = await seed();
    const o = await order(f);
    expect(await tx(g.customer, db => getOrder(db, f.orgId, o.id))).toBeNull();
    const visible = (await tx(g.customer, db => db.query("SELECT org_id FROM billing.top_up_order UNION ALL SELECT org_id FROM billing.billing_profile"))).rows;
    expect(visible.every(row => row.org_id === g.orgId)).toBe(true);
    // An owner cannot record a payment for their own workspace.
    await expect(settlePayment({ orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: rid("pi") }, f.ownerId, runtime))
      .rejects.toMatchObject({ code: "SCOPE_DENIED" });
    // A transaction scoped to another workspace cannot touch the order.
    await expect(tx({ orgId: g.orgId, actorId: WEBHOOK_ACTOR }, db => db.query("SELECT * FROM billing.record_purchase($1,$2,false,2420,'eur',$3)", [f.orgId, o.id, rid("pi")])))
      .rejects.toThrow(/SCOPE_DENIED/);
    // Worker roles have no payment functions and no tables.
    const client = await worker.connect();
    try {
      await expect(client.query("SELECT * FROM billing.top_up_order")).rejects.toThrow(/permission denied/);
      await expect(client.query("SELECT billing.auto_recharge_due(1)")).rejects.toThrow(/permission denied/);
    } finally { client.release(); }
    // The webhook health check counts unprocessed events; customers cannot ask.
    expect((await tx({ orgId: "", actorId: "system:webhook-health" }, db => db.query("SELECT billing.stripe_webhook_backlog(15) AS n"))).rows[0].n).toBeGreaterThanOrEqual(0);
    await expect(tx(f.customer, db => db.query("SELECT billing.stripe_webhook_backlog(15)"))).rejects.toThrow(/SCOPE_DENIED/);
    // Grants of free credits never pass for customers (L-09 contract unchanged).
    await expect(tx(f.customer, db => grantCredits(db, { orgId: f.orgId, key: "self", amountUcr: c(1), source: "grant" }))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("refuses the rollback while payments data exists", async () => {
    const sql = readFileSync("db/rollbacks/091_billing_payments_down.sql", "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/rollback refused/);
      await client.query("ROLLBACK").catch(() => undefined);
    } finally { client.release(); }
    expect((await owner.query("SELECT to_regclass('billing.top_up_order') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
