/**
 * Invoicing on the production schema (migration 092, launch L-13, spec
 * §6.14/§6.16): exactly one invoice per paid order under replays and
 * concurrency, the three tax cases, the rectifying invoice on a refund, the
 * invoicing job with the manual adapter and a fake vendor (retry queue,
 * backoff, lease), ops attaching the accountant's number and PDF (audited,
 * real private storage) and the owner download, live versus test documents,
 * roles and RLS, the monthly export with its reconciliation fixtures, and the
 * rollback refusal. Stripe and the email provider are fakes; the database and
 * object storage are scripts/evals/test-db.sh. It runs on its own copy of the database (I-12, tests/helpers/test-database.ts).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool, type PoolClient } from "pg";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeInvoicingProvider, fakePdf } from "./fake-invoicing-provider";

const sentEmails = vi.hoisted(() => [] as Array<{ to: string; subject: string; key: string; attachments?: Array<{ filename: string; content: Buffer }> }>);
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: async (message: { to: string; subject: string; attachments?: Array<{ filename: string; content: Buffer }> }, options: { idempotencyKey: string }) => {
    sentEmails.push({ ...message, key: options.idempotencyKey }); return { data: { id: "email_fixture" }, error: null };
  } } }),
}));
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { chargeAction } from "../../lib/billing/ledger";
import { createTopUpOrder, saveProfile, type ProfileInput } from "../../lib/billing/payments";
import { settlePayment, WEBHOOK_ACTOR } from "../../lib/billing/settlement";
import { handleStripeEvent } from "../../lib/billing/webhook";
import { refundTopUp } from "../../lib/billing/refunds";
import { taxMention } from "../../lib/billing/tax";
import { creditsToUcr } from "../../lib/billing/units";
import { manualInvoicingAdapter } from "../../lib/billing/invoicing/manual";
import { runInvoicing } from "../../lib/billing/invoicing/jobs";
import { accountantExport, claimInvoicing, getDocument, issueDocument, listDocuments, voidDocument } from "../../lib/billing/invoicing/store";
import { reconcileStripe, renderExport, type AccountantExport, type BalanceTransaction } from "../../lib/billing/invoicing/export";
import { adminInvoiceAction, invoicePdf, listInvoices } from "../../lib/billing/invoicing/api";
import { testDatabaseUrls } from "../helpers/test-database";

const { ownerUrl, runtimeUrl } = testDatabaseUrls("invoicing");
const s3 = process.env.EVALS_TEST_S3_ENDPOINT;
const SCHEDULER = "service:evals-scheduler";
const c = (credits: number) => creditsToUcr(credits);
const rid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const madridToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

process.env.ANALYTICS_EVENTS_V2 = "true";
process.env.BILLING_STRIPE_MODE = "test";

function rolePool(url: string, role: string, max: number) {
  const pool = new Pool({ connectionString: url, max });
  pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
  return pool;
}

/** A stand-in for the Stripe client: the calls the payment code makes. */
function fakeStripe() {
  const intents = new Map<string, Partial<Stripe.PaymentIntent>>();
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => {
        const intent = intents.get(id);
        if (!intent) throw Object.assign(new Error("No such payment_intent"), { type: "StripeInvalidRequestError" });
        return { id, object: "payment_intent", livemode: false, currency: "eur", metadata: {}, ...intent };
      },
    },
    customers: { update: async (id: string) => ({ id }) },
    refunds: { create: async (params: { payment_intent: string }) => ({ id: rid("re"), status: "succeeded", payment_intent: params.payment_intent }) },
  };
  return { stripe: stripe as unknown as Stripe, intents };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("invoicing on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 20 });
  const worker = rolePool(ownerUrl!, "evals_worker", 2);
  const env = { ...process.env };
  beforeAll(() => { process.env.EVALS_DATABASE_URL = runtimeUrl; });
  afterAll(async () => {
    process.env = env;
    await Promise.all([owner, runtime, worker].map(pool => pool.end()));
  });

  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  const system = (orgId: string) => ({ orgId, actorId: SCHEDULER });

  async function user(platformAdmin = false) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Invoicing fixture", `${randomUUID()}@example.test`]);
    if (platformAdmin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    return id;
  }
  const profile = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    legalName: "Acme Software SL", country: "ES", taxId: `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`, taxIdKind: "es_nif",
    viesStatus: "not_required", viesConsultation: null, taxTreatment: "es_vat", taxReviewReason: null, addressLine1: "Calle Mayor 1",
    addressLine2: null, postalCode: "47001", city: "Valladolid", region: null, billingEmail: "billing@acme.test", ...overrides,
  });
  const TREATMENTS = {
    es: {},
    eu: { legalName: "Acme SAS", country: "FR", taxId: `FR${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`, taxIdKind: "eu_vat", viesStatus: "valid",
      viesConsultation: "WAPIAAAAW1xyz", taxTreatment: "eu_reverse_charge", addressLine1: "1 rue de la Paix", postalCode: "75002", city: "Paris" },
    nonEu: { legalName: "Acme Inc.", country: "US", taxId: "US123456789", taxIdKind: "non_eu_business", taxTreatment: "non_eu_not_subject",
      addressLine1: "1 Market St", postalCode: "94105", city: "San Francisco", region: "CA" },
  } as const satisfies Record<string, Partial<ProfileInput>>;

  async function seed(overrides: Partial<ProfileInput> = {}) {
    const ownerId = await user(), editorId = await user(), orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Invoicing fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')", [orgId, ownerId, editorId]);
    const customer = { orgId, actorId: ownerId };
    await tx(customer, db => saveProfile(db, orgId, profile(overrides)));
    return { orgId, ownerId, editorId, customer };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;

  /** A paid test-mode order (or live, for live-document checks), credited through the real settlement path. */
  async function paid(f: Fixture, netCents = 2000, livemode = false) {
    const o = await tx(f.customer, db => createTopUpOrder(db, { orgId: f.orgId, key: `checkout:${randomUUID()}`, netCents, livemode, buyerDomain: null }));
    const pi = rid("pi");
    await settlePayment({ orgId: f.orgId, orderId: o.id, livemode, amountCents: o.grossCents, currency: "eur", paymentIntentId: pi }, WEBHOOK_ACTOR, runtime);
    return { ...o, pi };
  }
  const invoices = async (orderId: string) => (await owner.query("SELECT * FROM billing.invoice WHERE order_id=$1", [orderId])).rows;
  const creditNotes = async (orderId: string) => (await owner.query("SELECT * FROM billing.credit_note WHERE order_id=$1", [orderId])).rows;
  const document = async (table: "invoice" | "credit_note", orderId: string) => (await owner.query(`SELECT * FROM billing.${table} WHERE order_id=$1`, [orderId])).rows[0];
  const due = (table: "invoice" | "credit_note", orderId: string) => owner.query(`UPDATE billing.${table} SET next_attempt_at=now() WHERE order_id=$1`, [orderId]);
  function event(type: string, object: Record<string, unknown>) {
    return { id: rid("evt"), object: "event", type, livemode: false, api_version: "2025-09-30.clover", created: Math.floor(Date.now() / 1000), data: { object } } as unknown as Stripe.Event;
  }

  /* ------------------------------------------------ queued documents --- */

  it("queues exactly one invoice per paid order, with the series, the buyer's tax data and the VAT line or mention of each treatment", async () => {
    for (const [name, overrides] of Object.entries(TREATMENTS)) {
      const f = await seed(overrides as Partial<ProfileInput>);
      const o = await paid(f);
      const rows = await invoices(o.id);
      expect(rows, name).toHaveLength(1);
      const [inv] = rows;
      const treatment = (overrides as { taxTreatment?: string }).taxTreatment ?? "es_vat";
      expect(inv).toMatchObject({ org_id: f.orgId, livemode: false, series_code: "CAU", status: "queued", number: null, issue_date: null,
        net_cents: "2000", tax_treatment: treatment, tax_mention: taxMention(treatment as "es_vat"), locale: name === "es" ? "es" : "en", currency: "eur" });
      expect([Number(inv.vat_rate_bp), Number(inv.vat_cents), Number(inv.gross_cents)]).toEqual(treatment === "es_vat" ? [2100, 420, 2420] : [0, 0, 2000]);
      // The buyer's fiscal data as priced: legal name, tax ID (with its VIES record), address, billing email.
      const p = profile(overrides as Partial<ProfileInput>);
      expect(inv.customer).toMatchObject({ legal_name: p.legalName, country: p.country, tax_id_kind: p.taxIdKind, city: p.city, billing_email: p.billingEmail });
      expect(inv.customer.tax_id).toBe((await owner.query("SELECT tax_id FROM billing.billing_profile WHERE org_id=$1", [f.orgId])).rows[0].tax_id);
      // Purchased credits at 1 cent; the first top-up bonus free of charge.
      expect(inv.lines).toEqual([{ item: "credits", credits: 2000, unit_price_cents: 1, net_cents: 2000 }, { item: "bonus_credits", credits: 400, unit_price_cents: 0, net_cents: 0 }]);
      const order = (await owner.query(`SELECT o.invoice_id, i.operation_date = (o.paid_at AT TIME ZONE 'Europe/Madrid')::date AS same_day
        FROM billing.top_up_order o JOIN billing.invoice i ON i.order_id = o.id WHERE o.id=$1`, [o.id])).rows[0];
      expect(order).toEqual({ invoice_id: inv.id, same_day: true });
    }
    // The database's mention is the one receipts print (lib/billing/tax.ts).
    const mentions = (await owner.query("SELECT t, billing.tax_mention(t) AS m FROM unnest(ARRAY['es_vat','eu_reverse_charge','non_eu_not_subject']) t")).rows;
    for (const { t, m } of mentions) expect(m).toBe(taxMention(t));
  });

  it("keeps one invoice under replayed and concurrent deliveries of the payment", async () => {
    const f = await seed();
    const o = await tx(f.customer, db => createTopUpOrder(db, { orgId: f.orgId, key: `checkout:${randomUUID()}`, netCents: 5000, livemode: false, buyerDomain: null }));
    const pi = rid("pi");
    const { stripe, intents } = fakeStripe();
    intents.set(pi, { status: "succeeded", amount_received: o.grossCents });
    const completed = event("checkout.session.completed", { id: rid("cs_test"), object: "checkout.session", mode: "payment", livemode: false,
      metadata: { kind: "top_up", order_id: o.id, org_id: f.orgId }, payment_status: "paid", status: "complete", payment_intent: pi,
      amount_total: o.grossCents, currency: "eur", customer: rid("cus"), customer_details: { address: { country: "ES" }, tax_ids: [] } });
    const succeeded = event("payment_intent.succeeded", { id: pi, object: "payment_intent", livemode: false, amount_received: o.grossCents, currency: "eur", metadata: { order_id: o.id } });
    const ctx = { stripe, livemode: false, pool: runtime };
    await Promise.all([
      ...Array.from({ length: 5 }, () => handleStripeEvent(completed, JSON.stringify(completed), ctx)),
      ...Array.from({ length: 3 }, () => handleStripeEvent(succeeded, JSON.stringify(succeeded), ctx)),
      ...Array.from({ length: 4 }, () => settlePayment({ orgId: f.orgId, orderId: o.id, livemode: false, amountCents: o.grossCents, currency: "eur", paymentIntentId: pi }, "system:stripe-sync", runtime)),
    ]);
    for (let i = 0; i < 3; i++) await handleStripeEvent(completed, JSON.stringify(completed), ctx);
    expect(await invoices(o.id)).toHaveLength(1);
    // The backfill helper is idempotent too.
    const again = (await owner.query("SELECT billing._queue_invoice(o) AS id FROM billing.top_up_order o WHERE o.id=$1", [o.id])).rows[0].id;
    expect(again).toBe((await invoices(o.id))[0].id);
    expect(await invoices(o.id)).toHaveLength(1);
  });

  it("a refund queues one rectifying invoice that references the original, with negative amounts", async () => {
    const admin = await user(true);
    const f = await seed();
    const o = await paid(f);
    const { stripe } = fakeStripe();
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, stripe, runtime);
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, stripe, runtime);
    const refunded = event("charge.refunded", { id: rid("ch"), object: "charge", livemode: false, payment_intent: o.pi, amount_refunded: o.grossCents });
    await handleStripeEvent(refunded, JSON.stringify(refunded), { stripe, livemode: false, pool: runtime });
    const [inv] = await invoices(o.id);
    const notes = await creditNotes(o.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ invoice_id: inv.id, series_code: "CAU-R", reason: "refund", status: "queued", net_cents: "-2000", vat_cents: "-420",
      gross_cents: "-2420", vat_rate_bp: 2100, tax_treatment: "es_vat", customer: inv.customer, locale: "es" });
    expect(notes[0].lines).toEqual([{ item: "credits", credits: -2000, unit_price_cents: 1, net_cents: -2000 }, { item: "bonus_credits", credits: -400, unit_price_cents: 0, net_cents: 0 }]);

    // A refund made in the Stripe dashboard is mirrored and rectified the same way.
    const g = await seed(TREATMENTS.nonEu);
    const p = await paid(g);
    const outside = event("charge.refunded", { id: rid("ch"), object: "charge", livemode: false, payment_intent: p.pi, amount_refunded: p.grossCents });
    await handleStripeEvent(outside, JSON.stringify(outside), { stripe, livemode: false, pool: runtime });
    expect((await creditNotes(p.id)).map(row => [row.gross_cents, row.tax_mention])).toEqual([["-2000", "Operación no sujeta"]]);
  });

  /* ---------------------------------------------------- the job --- */

  it("the manual adapter hands requests to the accountant and never issues a number", async () => {
    const admin = await user(true);
    const f = await seed();
    const o = await paid(f);
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, fakeStripe().stripe, runtime);
    const tick = await runInvoicing(SCHEDULER, { adapter: manualInvoicingAdapter(), pool: runtime, env: {}, limit: 200 });
    expect(tick.failed).toBe(0);
    for (const table of ["invoice", "credit_note"] as const) {
      expect(await document(table, o.id)).toMatchObject({ status: "pending_issue", provider: "manual", number: null, attempts: 1, last_error_code: null });
      expect((await document(table, o.id)).handed_over_at).not.toBeNull();
    }
    // Nothing more happens to them: the accountant issues them from the export.
    await runInvoicing(SCHEDULER, { adapter: manualInvoicingAdapter(), pool: runtime, env: {} });
    expect((await document("invoice", o.id)).attempts).toBe(1);
    // With the provider off, the job does nothing at all.
    const g = await seed();
    const q = await paid(g);
    expect(await runInvoicing(SCHEDULER, { pool: runtime, env: {} })).toEqual({ due: 0, handedOver: 0, issued: 0, failed: 0, waiting: 0 });
    expect((await document("invoice", q.id)).status).toBe("queued");
  });

  it("a vendor adapter issues the invoice and the rectifying invoice, keeps each PDF and emails the billing contact once", async () => {
    const admin = await user(true);
    const f = await seed({ billingEmail: "facturas@caudals.com" });
    const o = await paid(f);
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, fakeStripe().stripe, runtime);
    const vendor = fakeInvoicingProvider();
    const stored = new Map<string, Uint8Array>();
    const issued: string[] = [];
    const tick = await runInvoicing(SCHEDULER, {
      adapter: vendor.adapter, pool: runtime, env: {}, limit: 200,
      storePdf: async (doc, bytes) => { const key = `evals/${doc.orgId}/${doc.id}/sealed/${randomUUID()}`; stored.set(key, bytes); return { objectKey: key, sha256: "a".repeat(64), byteSize: bytes.length }; },
      afterIssued: async doc => { issued.push(doc.id); },
    });
    expect(tick.failed).toBe(0);
    const inv = await document("invoice", o.id), note = await document("credit_note", o.id);
    expect(inv).toMatchObject({ status: "issued", provider: "fakeprovider", verifactu_status: "accepted", provider_customer_reference: expect.stringMatching(/^fake_cus_/) });
    expect(inv.number).toMatch(/^TEST-CAU-\d+$/);
    expect(note.number).toMatch(/^TEST-CAU-R-\d+$/);
    expect(note.status).toBe("issued");
    expect(stored.has(inv.pdf_object_key) && stored.has(note.pdf_object_key)).toBe(true);
    expect(issued).toEqual(expect.arrayContaining([inv.id, note.id]));
    // The rectifying invoice went to the vendor with the original's reference.
    expect(vendor.calls.filter(call => call.startsWith(`rectifying:${note.id}`))).toHaveLength(1);
  });

  it("retries a failing vendor with a growing backoff (retry queue), then issues", async () => {
    const f = await seed();
    const o = await paid(f);
    const vendor = fakeInvoicingProvider({ failTimes: 2, pdf: false });
    const run = () => runInvoicing(SCHEDULER, { adapter: vendor.adapter, pool: runtime, env: {}, limit: 200, afterIssued: async () => undefined });
    await run();
    let inv = await document("invoice", o.id);
    expect(inv).toMatchObject({ status: "queued", attempts: 1, last_error_code: "provider_unavailable", provider: "fakeprovider" });
    const wait = (row: { next_attempt_at: Date }) => Math.round((row.next_attempt_at.getTime() - Date.now()) / 60_000);
    expect(wait(inv)).toBe(1);
    await run();
    expect((await document("invoice", o.id)).attempts).toBe(1); // not due yet
    await due("invoice", o.id);
    await run();
    inv = await document("invoice", o.id);
    expect(inv.attempts).toBe(2);
    expect(wait(inv)).toBe(2);
    await due("invoice", o.id);
    await run();
    inv = await document("invoice", o.id);
    expect(inv).toMatchObject({ status: "issued", attempts: 3, last_error_code: null, pdf_object_key: null });
    // A crash after a claim retries after the 10-minute lease.
    const g = await seed();
    const q = await paid(g);
    const pendingId = (await invoices(q.id))[0].id as string;
    const claimed = await tx(system(g.orgId), db => claimInvoicing(db, { orgId: g.orgId, kind: "invoice", id: pendingId }));
    expect(claimed).toMatchObject({ status: "queued", attempts: 1 });
    expect(wait(await document("invoice", q.id))).toBe(10);
    expect(await tx(system(g.orgId), db => claimInvoicing(db, { orgId: g.orgId, kind: "invoice", id: claimed!.id }))).toBeNull();
  });

  it("a rectifying invoice waits until its original has been handed over", async () => {
    const admin = await user(true);
    const f = await seed();
    const o = await paid(f);
    await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: admin }, fakeStripe().stripe, runtime);
    const note = await document("credit_note", o.id);
    expect(await tx(system(f.orgId), db => claimInvoicing(db, { orgId: f.orgId, kind: "credit_note", id: note.id }))).toBeNull();
    const after = await document("credit_note", o.id);
    expect(after.attempts).toBe(0);
    expect(after.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 30_000);
  });

  /* ----------------------------------- ops attach, owners download --- */

  describe.skipIf(!s3)("ops attach the accountant's number and PDF; owners download it", () => {
    beforeAll(async () => {
      Object.assign(process.env, {
        BILLING_INVOICING_PROVIDER: "manual", RESEND_FROM_EMAIL: "billing@example.test",
        DO_SPACES_ENDPOINT: s3, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-invoicing-test", DO_SPACES_ACCESS_KEY_ID: "evals_test",
        DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true", NEXT_PUBLIC_DO_SPACES_CDN_URL: "disabled",
      });
      const client = new S3Client({ endpoint: s3, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
      try { await client.send(new CreateBucketCommand({ Bucket: "evals-invoicing-test" })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
      client.destroy();
    });

    const identity = (id: string, f: Fixture, role: "owner" | "editor" | null, platformRole: "platform_admin" | null = null, minutesAgo = 1) => ({
      user: { id, email: `${id}@example.test`, name: "Fixture" }, platformRole,
      workspaces: role ? [{ id: f.orgId, name: "Invoicing fixture", role }] : [], sessionCreatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    });
    const request = (key = randomUUID()) => new Request("https://app.caudals.com/api/evals/v1/billing/admin/invoices/x", { method: "POST", headers: { "idempotency-key": key } });
    const pdf = fakePdf("issued by the accountant");
    const issueBody = (f: Fixture, number: string, overrides: Record<string, unknown> = {}) => ({
      action: "issue" as const, orgId: f.orgId, kind: "invoice" as const, number, issueDate: madridToday(), pdfBase64: Buffer.from(pdf).toString("base64"),
      reason: "Issued by the accountant from the October export", ...overrides,
    });

    it("records a number in the series with its PDF (audited), emails the PDF once, and serves it to the owner only", async () => {
      const adminId = await user(true);
      const f = await seed({ billingEmail: "facturas@caudals.com" });
      const o = await paid(f);
      await runInvoicing(SCHEDULER, { adapter: manualInvoicingAdapter(), pool: runtime, env: {}, limit: 200 });
      const inv = await document("invoice", o.id);
      const admin = identity(adminId, f, null, "platform_admin");
      const number = `TEST-CAU-${Date.now()}`;

      // Refusals: a live-series number on a test document, a non-PDF, a date before the payment, stale sign-in, not an admin.
      await expect(adminInvoiceAction(request(), admin, inv.id, issueBody(f, "CAU-2026-0001"))).rejects.toMatchObject({ code: "INVOICE_NUMBER_INVALID", status: 422 });
      await expect(adminInvoiceAction(request(), admin, inv.id, issueBody(f, number, { pdfBase64: Buffer.from("<html>".padEnd(120, "x")).toString("base64") })))
        .rejects.toMatchObject({ code: "PDF_INVALID" });
      await expect(adminInvoiceAction(request(), admin, inv.id, issueBody(f, number, { issueDate: "2026-01-01" }))).rejects.toMatchObject({ code: "ISSUE_DATE_INVALID" });
      await expect(adminInvoiceAction(request(), identity(adminId, f, null, "platform_admin", 30), inv.id, issueBody(f, number))).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
      await expect(adminInvoiceAction(request(), identity(f.ownerId, f, "owner"), inv.id, issueBody(f, number))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      // An owner cannot download a request that is not issued.
      await expect(invoicePdf(identity(f.ownerId, f, "owner"), f.orgId, inv.id)).rejects.toMatchObject({ status: 404 });

      const key = randomUUID();
      const result = await adminInvoiceAction(request(key), admin, inv.id, issueBody(f, number, { verifactuStatus: "accepted" }));
      expect(result).toMatchObject({ status: "issued", number, issueDate: madridToday(), pdfAvailable: true, email: "sent" });
      const stored = await document("invoice", o.id);
      expect(stored).toMatchObject({ status: "issued", number, issued_by: adminId, verifactu_status: "accepted", pdf_byte_size: pdf.length });
      const audit = (await owner.query("SELECT details FROM evals.audit_event WHERE org_id=$1 AND action='billing.invoice_issued'", [f.orgId])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].details).toMatchObject({ kind: "invoice", number, series: "CAU", reason: "Issued by the accountant from the October export", provider: "manual" });
      // One email to the billing contact, with the PDF; replays send nothing more.
      const mails = sentEmails.filter(mail => mail.key === `billing-invoice_available:${inv.id}`);
      expect(mails).toHaveLength(1);
      expect(mails[0]).toMatchObject({ to: "facturas@caudals.com", subject: `Tu factura de Caudals ${number}` });
      expect(Buffer.from(mails[0].attachments![0].content).equals(Buffer.from(pdf))).toBe(true);
      expect(await adminInvoiceAction(request(key), admin, inv.id, issueBody(f, number, { verifactuStatus: "accepted" }))).toMatchObject({ number });
      expect(await adminInvoiceAction(request(), admin, inv.id, issueBody(f, number))).toMatchObject({ number, email: "duplicate" });
      expect(sentEmails.filter(mail => mail.key === `billing-invoice_available:${inv.id}`)).toHaveLength(1);
      await expect(adminInvoiceAction(request(), admin, inv.id, issueBody(f, `${number}-2`))).rejects.toMatchObject({ code: "INVOICE_ALREADY_ISSUED" });

      // The owner lists and downloads it; an editor gets 404.
      const listed = await listInvoices(identity(f.ownerId, f, "owner"), f.orgId);
      expect(listed.invoices).toEqual([expect.objectContaining({ id: inv.id, kind: "invoice", status: "issued", number, grossCents: 2420, pdfAvailable: true })]);
      const response = await invoicePdf(identity(f.ownerId, f, "owner"), f.orgId, inv.id);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${number}.pdf"`);
      expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(pdf))).toBe(true);
      await expect(listInvoices(identity(f.editorId, f, "editor"), f.orgId)).rejects.toMatchObject({ status: 404 });
      await expect(invoicePdf(identity(f.editorId, f, "editor"), f.orgId, inv.id)).rejects.toMatchObject({ status: 404 });
      // Another workspace's owner cannot reach it by id.
      const g = await seed();
      await expect(invoicePdf(identity(g.ownerId, g, "owner"), g.orgId, inv.id)).rejects.toMatchObject({ status: 404 });

      // The same number on another invoice is refused.
      const h = await seed();
      const p = await paid(h);
      const other = await document("invoice", p.id);
      await expect(adminInvoiceAction(request(), identity(adminId, h, null, "platform_admin"), other.id, issueBody(h, number))).rejects.toMatchObject({ code: "INVOICE_NUMBER_TAKEN" });
    });

    it("issues a rectifying invoice only after its original, citing it", async () => {
      const adminId = await user(true);
      const f = await seed();
      const o = await paid(f);
      await refundTopUp({ orgId: f.orgId, orderId: o.id, reason: "Customer asked within 14 days", actorId: adminId }, fakeStripe().stripe, runtime);
      const admin = identity(adminId, f, null, "platform_admin");
      const inv = await document("invoice", o.id), note = await document("credit_note", o.id);
      const stamp = Date.now();
      await expect(adminInvoiceAction(request(), admin, note.id, issueBody(f, `TEST-CAU-R-${stamp}`, { kind: "credit_note" }))).rejects.toMatchObject({ code: "ORIGINAL_NOT_ISSUED" });
      await adminInvoiceAction(request(), admin, inv.id, issueBody(f, `TEST-CAU-${stamp}`));
      expect(await adminInvoiceAction(request(), admin, note.id, issueBody(f, `TEST-CAU-R-${stamp}`, { kind: "credit_note" })))
        .toMatchObject({ kind: "credit_note", status: "issued", grossCents: -2420, rectifies: inv.id });
      const listed = await listInvoices(identity(f.ownerId, f, "owner"), f.orgId);
      expect(listed.invoices.find(item => item.id === note.id)).toMatchObject({ rectifiesNumber: `TEST-CAU-${stamp}` });
    });
  });

  /* -------------------------------------------- live and test documents --- */

  it("live documents take series numbers only and are never voided; test documents can be voided with a reason", async () => {
    const adminId = await user(true);
    const f = await seed();
    const live = await paid(f, 2000, true);
    const inv = await document("invoice", live.id);
    expect(inv.livemode).toBe(true);
    const scope = { orgId: f.orgId, actorId: adminId };
    const issue = (number: string) => tx(scope, db => issueDocument(db, { orgId: f.orgId, kind: "invoice", id: inv.id, number, issueDate: madridToday(), reason: "Issued by the accountant" }));
    await expect(issue("TEST-1")).rejects.toMatchObject({ code: "INVOICE_NUMBER_INVALID" });
    await expect(issue(`CAU-R-2026-${Date.now()}`)).rejects.toMatchObject({ code: "INVOICE_NUMBER_INVALID" });
    await expect(tx(scope, db => issueDocument(db, { orgId: f.orgId, kind: "invoice", id: inv.id, number: `CAU-2026-${Date.now()}`, issueDate: madridToday() })))
      .rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const number = `CAU-2026-${Date.now()}`;
    expect(await issue(number)).toMatchObject({ status: "issued", number, livemode: true });
    await expect(tx(scope, db => voidDocument(db, { orgId: f.orgId, kind: "invoice", id: inv.id, reason: "Mistake" }))).rejects.toMatchObject({ code: "INVOICE_VOID_LIVE" });

    const test = await paid(f);
    await refundTopUp({ orgId: f.orgId, orderId: test.id, reason: "Customer asked within 14 days", actorId: adminId }, fakeStripe().stripe, runtime);
    const testInvoice = await document("invoice", test.id);
    await expect(tx(scope, db => voidDocument(db, { orgId: f.orgId, kind: "invoice", id: testInvoice.id, reason: " " }))).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect(await tx(scope, db => voidDocument(db, { orgId: f.orgId, kind: "invoice", id: testInvoice.id, reason: "Stripe test-mode check" }))).toMatchObject({ status: "voided" });
    expect((await document("credit_note", test.id)).status).toBe("voided");
    expect((await tx(scope, db => listDocuments(db, f.orgId))).map(doc => doc.id)).toEqual([inv.id]);
    expect(Number((await owner.query("SELECT count(*) FROM evals.audit_event WHERE org_id=$1 AND action='billing.invoice_voided'", [f.orgId])).rows[0].count)).toBe(1);
  });

  /* ------------------------------------------------- roles and RLS --- */

  it("keeps documents per workspace, writes to services and admins, and nothing to workers", async () => {
    const f = await seed(), g = await seed();
    const o = await paid(f);
    const inv = await document("invoice", o.id);
    expect(await tx(g.customer, db => getDocument(db, f.orgId, inv.id))).toBeNull();
    const visible = (await tx(g.customer, db => db.query("SELECT org_id FROM billing.invoice UNION ALL SELECT org_id FROM billing.credit_note UNION ALL SELECT org_id FROM billing.invoice_document"))).rows;
    expect(visible.every(row => row.org_id === g.orgId)).toBe(true);
    // The runtime role reads, never writes.
    await expect(tx(f.customer, db => db.query("UPDATE billing.invoice SET number='TEST-x' WHERE id=$1", [inv.id]))).rejects.toThrow(/permission denied/);
    await expect(tx(f.customer, db => db.query("INSERT INTO billing.invoice_series(code,purpose,number_pattern,description) VALUES('X1','credits','^x','x')"))).rejects.toThrow(/permission denied/);
    // Owners cannot run the job, issue, void or export.
    for (const sql of [
      ["SELECT billing.claim_invoicing($1,'invoice',$2)", [f.orgId, inv.id]],
      ["SELECT billing.issue_invoice_document($1,'invoice',$2,'TEST-1',current_date,NULL,NULL,NULL,NULL,NULL,NULL,'because')", [f.orgId, inv.id]],
      ["SELECT billing.void_invoice_document($1,'invoice',$2,'because')", [f.orgId, inv.id]],
      ["SELECT billing.record_invoicing_handover($1,'invoice',$2,'manual')", [f.orgId, inv.id]],
      ["SELECT * FROM billing.invoicing_due(10)", []],
      ["SELECT billing.accountant_export(current_date,false)", []],
      ["SELECT * FROM billing.invoice_documents_admin()", []],
    ] as const) {
      await expect(tx(f.customer, db => db.query(sql[0], [...sql[1]]))).rejects.toThrow(/SCOPE_DENIED/);
    }
    // A service scoped to another workspace cannot touch the document.
    await expect(tx(system(g.orgId), db => db.query("SELECT billing.claim_invoicing($1,'invoice',$2)", [f.orgId, inv.id]))).rejects.toThrow(/SCOPE_DENIED/);
    const client = await worker.connect();
    try {
      await expect(client.query("SELECT * FROM billing.invoice")).rejects.toThrow(/permission denied/);
      await expect(client.query("SELECT * FROM billing.invoicing_due(1)")).rejects.toThrow(/permission denied/);
    } finally { client.release(); }
  });

  /* ------------------------------------------------ the monthly export --- */

  it("exports the month (sales by treatment, credit roll-forward, documents) and reconciles it to Stripe fixtures", async () => {
    const admin = await user(true);
    const fixtures = [await seed(), await seed(TREATMENTS.eu), await seed(TREATMENTS.nonEu)];
    const orders: Array<Awaited<ReturnType<typeof paid>>> = [];
    for (const f of fixtures) orders.push(await paid(f, 5000));
    // Some consumption, and one refund.
    await tx({ orgId: fixtures[0].orgId, actorId: "service:evals-worker" }, db => chargeAction(db, { orgId: fixtures[0].orgId, key: `unit:${randomUUID()}`, meter: "website_question", amountUcr: c(1125) }));
    const refunded = await paid(fixtures[1], 2000);
    await refundTopUp({ orgId: fixtures[1].orgId, orderId: refunded.id, reason: "Customer asked within 14 days", actorId: admin }, fakeStripe().stripe, runtime);
    await owner.query("UPDATE billing.top_up_order SET stripe_charge_id='ch_' || replace(id::text,'-','') WHERE livemode=false AND stripe_charge_id IS NULL AND paid_at IS NOT NULL");
    await owner.query("UPDATE billing.top_up_order SET stripe_refund_id='re_' || replace(id::text,'-','') WHERE id=$1", [refunded.id]);

    const month = madridToday().slice(0, 7);
    const data = await tx({ orgId: "", actorId: "system:accountant-export" }, db => accountantExport(db, month, false)) as unknown as AccountantExport;
    expect(data).toMatchObject({ month, livemode: false, time_zone: "Europe/Madrid" });
    expect(data.checks).toMatchObject({ paid_orders_without_invoice: 0, refunded_orders_without_credit_note: 0, deferred_balance_mismatch: 0 });
    // Sales by treatment equal what the orders say.
    const expected = (await owner.query(`SELECT tax_treatment, count(*)::int AS n, sum(net_cents)::int AS net, sum(vat_cents)::int AS vat FROM billing.top_up_order
      WHERE livemode=false AND purchase_entry_id IS NOT NULL AND paid_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'
      GROUP BY 1 ORDER BY 1`)).rows;
    expect(data.sales.map(s => ({ tax_treatment: s.tax_treatment, n: s.orders, net: Number(s.net_cents), vat: Number(s.vat_cents) }))).toEqual(expected);
    expect(data.sales.find(s => s.tax_treatment === "eu_reverse_charge")?.tax_mention).toBe("Inversión del sujeto pasivo");
    // The purchased-credit roll-forward closes on what the lots hold.
    const lots = (await owner.query(`SELECT coalesce(sum(l.remaining_ucr),0)::text AS r FROM billing.credit_lot l JOIN billing.top_up_order o ON o.org_id=l.org_id AND o.id=l.order_id
      WHERE l.source='purchase' AND o.livemode=false`)).rows[0].r;
    expect(Number(data.purchased_credits.closing.credits)).toBe(Number(BigInt(lots) / BigInt(1_000_000)));
    expect(Number(data.purchased_credits.consumed.credits)).toBeLessThanOrEqual(-125);
    expect(Number(data.purchased_credits.refunded.credits)).toBeLessThanOrEqual(-2000);
    expect(Number(data.purchased_credits.closing.eur)).toBeCloseTo(Number(data.purchased_credits.closing.credits) / 100, 2);
    // Our orders and their documents are listed with the fiscal data and the series to issue in.
    for (const o of orders) expect(data.orders.find(row => row.id === o.id)).toMatchObject({ status: "paid", invoice: expect.objectContaining({ status: "queued" }) });
    const note = data.documents.find(row => row.order_id === refunded.id && row.kind === "credit_note");
    expect(note).toMatchObject({ series_code: "CAU-R", number_pattern: "^CAU-R-[0-9][0-9A-Za-z/._-]{0,39}$", rectifies: expect.objectContaining({ series_code: "CAU" }) });

    // Reconciliation fixtures: Stripe's balance transactions for each payment and refund.
    const transactions: BalanceTransaction[] = data.orders.flatMap(row => [
      ...(row.paid_at ? [{ id: `txn_${row.id}`, type: "charge", amount: Number(row.gross_cents), fee: 25, net: Number(row.gross_cents) - 25, currency: "eur", created: 0, sourceId: row.charge, paymentIntentId: row.payment_intent }] : []),
      ...(row.status === "refunded" ? [{ id: `txn_r_${row.id}`, type: "refund", amount: -Number(row.gross_cents), fee: 0, net: -Number(row.gross_cents), currency: "eur", created: 0, sourceId: row.refund, paymentIntentId: row.payment_intent }] : []),
    ]);
    const reconciled = reconcileStripe(data, transactions);
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.totals.ordersGrossCents).toBe(reconciled.totals.stripeChargesCents);
    const broken = reconcileStripe(data, transactions.map(t => (t.sourceId === `ch_${orders[0].id.replaceAll("-", "")}` ? { ...t, amount: t.amount - 1 } : t)));
    expect(broken.rows.find(row => row.orderId === orders[0].id)?.status).toBe("amount_mismatch");
    const files = renderExport(data, { issuer: null, reconciliation: reconciled });
    expect(files["documents.csv"]).toContain("Acme SAS");
    expect(files["summary.md"]).toContain("Reconciled");
  });

  it("refuses the rollback while invoice documents exist", async () => {
    const sql = readFileSync("db/rollbacks/092_billing_invoices_down.sql", "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/rollback refused/);
      await client.query("ROLLBACK").catch(() => undefined);
    } finally { client.release(); }
    expect((await owner.query("SELECT to_regclass('billing.invoice') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
