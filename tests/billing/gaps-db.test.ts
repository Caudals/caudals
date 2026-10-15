/**
 * Launch G2 on the production schema (migration 112): provider-price check
 * acknowledgements (the L-10 alert's source of truth) and the manual tax
 * review of billing profiles (L-12, spec §6.14) with the IVA rules for the
 * Canary Islands, Ceuta, Melilla and an EU VAT number VIES could not confirm,
 * through the ops console's server handlers; the rollback's refusal. Both the
 * price check and the review queue are database-wide, so the file runs on
 * its own copy of the database (I-12, tests/helpers/test-database.ts).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { createTopUpOrder, getProfile, saveProfile, type ProfileInput } from "../../lib/billing/payments";
import { acknowledgePriceCheckForAdmin, priceCheckStatus } from "../../lib/billing/price-check-ack";
import { listRevisionsForAdmin } from "../../lib/billing/api";
import { resolveTaxReviewForAdmin, taxReviewsForAdmin } from "../../lib/billing/tax-review";
import { refreshVies, startTopUp } from "../../lib/billing/top-ups";
import type { ViesResult } from "../../lib/billing/tax";
import { testDatabaseUrls } from "../helpers/test-database";

const { ownerUrl, runtimeUrl } = testDatabaseUrls("billing_gaps");
const ENV_KEYS = ["EVALS_DATABASE_URL", "BILLING_STRIPE_MODE", "STRIPE_SECRET_KEY", "BILLING_TEST_WORKSPACE_IDS", "BILLING_CREDITS_ENABLED"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

describe.skipIf(!ownerUrl || !runtimeUrl)("billing gaps (G2) on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 8 });
  beforeAll(() => { process.env.EVALS_DATABASE_URL = runtimeUrl; });
  afterEach(() => { delete process.env.BILLING_TEST_WORKSPACE_IDS; delete process.env.STRIPE_SECRET_KEY; });
  afterAll(async () => {
    for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    await Promise.all([owner.end(), runtime.end()]);
  });

  const tx = <T>(scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, runtime);
  async function user(role: "platform_admin" | "operator" | null = null) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "G2 fixture", `${randomUUID()}@example.test`]);
    if (role) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, role]);
    return id;
  }
  const identity = (id: string, platformRole: EvalIdentity["platformRole"] = "platform_admin", minutesAgo = 1, workspaces: EvalIdentity["workspaces"] = []): EvalIdentity => ({
    user: { id, email: `${id}@example.test`, name: "Admin" }, platformRole, workspaces, sessionCreatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
  const request = (key = randomUUID()) => new Request("https://app.caudals.com/api/evals/v1/billing/admin/x", { method: "POST", headers: { "idempotency-key": key } });
  const audit = async (action: string, orgId?: string) => (await owner.query(
    "SELECT org_id,actor_id,subject_id,details FROM evals.audit_event WHERE action=$1 AND ($2::uuid IS NULL OR org_id=$2) ORDER BY created_at", [action, orgId ?? null])).rows;

  /* ------------------------------------------------- price-check alert --- */

  describe("provider-price check acknowledgements (L-10 alert)", () => {
    const revision = async () => (await owner.query("SELECT id FROM billing.price_book_at(now())")).rows[0].id as string;
    const change = (model: string, listed: string, recompute = true, status = "changed") => ({ label: model, provider: "openrouter", modelId: model, minInputTokens: 0,
      listing: model, proxy: false, status, input: { book: "0.1", listed, change: 0.5 }, output: { book: "0.5", listed: "0.5", change: 0 }, recompute });
    const record = async (changes: unknown[], minutesAgo: number) => (await owner.query(`INSERT INTO billing.price_check(actor_id,revision_id,checked,changed,unavailable,changes,checked_at)
      VALUES('service:evals-scheduler',$1,12,$2,0,$3::jsonb,now()-make_interval(mins=>$4)) RETURNING id`,
      [await revision(), changes.filter(item => (item as { status: string }).status === "changed").length, JSON.stringify(changes), minutesAgo])).rows[0].id as string;
    const status = (actorId: string) => tx({ orgId: "", actorId }, db => priceCheckStatus(db));

    it("opens on unacknowledged changes; a platform admin acknowledges them with a note, audited; the same findings stay acknowledged", async () => {
      const admin = await user("platform_admin"), operator = await user("operator"), customer = await user();
      const { orgId } = await workspace(customer);
      expect(await status(admin)).toBeNull();
      const first = await record([change("openai/gpt-6-luna", "0.15"), change("deepseek/v4-flash", "0.1", true, "unavailable")], 300);
      expect(await status(admin)).toMatchObject({ checkId: first, alerting: 2, acknowledgement: null, open: true });

      const body = { orgId, note: "Absorbing the FX move until the November ECB rate" };
      await expect(acknowledgePriceCheckForAdmin(request(), identity(admin, "platform_admin", 30), first, body)).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(operator, "operator"), first, body)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(customer, null), first, body)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(admin), first, { ...body, note: "x" })).rejects.toThrow();
      const key = randomUUID();
      const done = await acknowledgePriceCheckForAdmin(request(key), identity(admin), first, body);
      expect(done).toMatchObject({ checkId: first, acknowledgedBy: admin, note: body.note });
      // A replay answers the same; acknowledging again writes nothing more.
      expect(await acknowledgePriceCheckForAdmin(request(key), identity(admin), first, body)).toEqual(done);
      expect(await acknowledgePriceCheckForAdmin(request(), identity(admin), first, body)).toMatchObject({ checkId: first });
      expect(await audit("billing.price_check_acknowledged")).toEqual([
        expect.objectContaining({ actor_id: admin, subject_id: first, details: expect.objectContaining({ note: body.note, alerting: 2 }) })]);
      expect(await status(admin)).toMatchObject({ checkId: first, open: false, acknowledgement: { by: admin, note: body.note, checkId: first } });
      // The console's price book shows it.
      const list = await listRevisionsForAdmin(identity(admin), orgId);
      expect(list.latestCheck).toMatchObject({ id: first, alerting: 2, open: false, acknowledgement: { note: body.note } });

      // Next week, the same findings (in another order): still acknowledged.
      const second = await record([change("deepseek/v4-flash", "0.1", true, "unavailable"), change("openai/gpt-6-luna", "0.15")], 200);
      expect(await status(admin)).toMatchObject({ checkId: second, alerting: 2, open: false, acknowledgement: { checkId: first } });
      // A new listed price opens it again, and only the latest check can be acknowledged.
      const third = await record([change("openai/gpt-6-luna", "0.2"), change("deepseek/v4-flash", "0.1", true, "unavailable")], 100);
      expect(await status(admin)).toMatchObject({ checkId: third, open: true, acknowledgement: null });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(admin), second, body)).rejects.toMatchObject({ code: "PRICE_CHECK_SUPERSEDED", status: 409 });
      await acknowledgePriceCheckForAdmin(request(), identity(admin), third, { orgId, note: "Draft revision 3 created with the new list price" });
      expect((await status(admin))?.open).toBe(false);
      // A check with nothing for ops: nothing to acknowledge, nothing open.
      const clean = await record([change("google/gemini-3.1-flash-lite", "0.25", false, "unavailable")], 50);
      expect(await status(admin)).toMatchObject({ checkId: clean, alerting: 0, open: false });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(admin), clean, body)).rejects.toMatchObject({ code: "PRICE_CHECK_CLEAN" });
      await expect(acknowledgePriceCheckForAdmin(request(), identity(admin), randomUUID(), body)).rejects.toMatchObject({ code: "PRICE_CHECK_NOT_FOUND", status: 404 });
      // Append-only, and the runtime role cannot write it directly.
      await expect(owner.query("UPDATE billing.price_check_ack SET note='edited' WHERE check_id=$1", [first])).rejects.toThrow("LEDGER_APPEND_ONLY");
      await expect(tx({ orgId: "", actorId: admin }, db => db.query("INSERT INTO billing.price_check_ack(check_id,fingerprint,note,actor_id) VALUES($1,repeat('0',64),'forged','x')", [first])))
        .rejects.toThrow(/permission denied/);
    });
  });

  /* ------------------------------------------------------- tax review --- */

  async function workspace(ownerId?: string) {
    const ownerUser = ownerId ?? await user(), orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [orgId, `G2 fixture ${orgId.slice(0, 6)}`, ownerUser]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerUser]);
    return { orgId, ownerId: ownerUser, owner: identity(ownerUser, null, 1, [{ id: orgId, name: "G2 fixture", role: "owner" }]) };
  }
  const nif = () => `B${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}0`;
  const base = { legalName: "Acme Canarias SL", country: "ES", taxIdKind: "es_nif", viesStatus: "not_required", viesConsultation: null, addressLine1: "Calle Triana 1",
    addressLine2: null, region: null, billingEmail: "billing@acme.test" } as const;
  /** A profile as lib/billing/tax.ts decides it: a special territory or a VIES outage waits for review. */
  async function profile(orgId: string, ownerId: string, kind: "canarias" | "ceuta" | "melilla" | "vies" | "madrid") {
    const input: ProfileInput = kind === "vies"
      ? { ...base, legalName: "Acme Italia Srl", country: "IT", taxId: `IT${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`, taxIdKind: "eu_vat", viesStatus: "unavailable",
        taxTreatment: null, taxReviewReason: "vies_unavailable", postalCode: "00100", city: "Roma" }
      : kind === "madrid" ? { ...base, taxId: nif(), taxTreatment: "es_vat", taxReviewReason: null, postalCode: "28001", city: "Madrid" }
        : { ...base, taxId: nif(), taxTreatment: null, taxReviewReason: "es_special_territory",
          postalCode: kind === "canarias" ? "35001" : kind === "ceuta" ? "51001" : "52001", city: kind === "canarias" ? "Las Palmas de Gran Canaria" : kind === "ceuta" ? "Ceuta" : "Melilla" };
    return tx({ orgId, actorId: ownerId }, db => saveProfile(db, orgId, input));
  }
  const order = (orgId: string, ownerId: string, netCents = 2000) =>
    tx({ orgId, actorId: ownerId }, db => createTopUpOrder(db, { orgId, key: `checkout:${randomUUID()}`, netCents, livemode: false, buyerDomain: null }));
  const resolve = (admin: EvalIdentity, orgId: string, body: Record<string, unknown>, key = randomUUID()) => resolveTaxReviewForAdmin(request(key), admin, orgId, body);
  const reason = "Checked the deed: established in Las Palmas, IGIC applies";

  describe("manual tax review (L-12, §6.14)", () => {
    it("queues a Canary Islands profile with the purchase it refused, and an admin sets 'not subject' so the buyer completes Checkout with 0 % IVA", async () => {
      const f = await workspace();
      const saved = await profile(f.orgId, f.ownerId, "canarias");
      // The buyer tries to top up (test mode, an internal test workspace): refused, recorded for ops.
      process.env.BILLING_STRIPE_MODE = "test"; process.env.STRIPE_SECRET_KEY = "sk_test_fixture"; process.env.BILLING_TEST_WORKSPACE_IDS = f.orgId;
      await expect(startTopUp(request(), f.owner, { orgId: f.orgId, pack: "eur_50", acceptTerms: true, locale: "es" }, randomUUID()))
        .rejects.toMatchObject({ code: "TAX_REVIEW_REQUIRED", status: 409, message: expect.stringContaining("Canary Islands") });
      await expect(order(f.orgId, f.ownerId)).rejects.toMatchObject({ code: "TAX_REVIEW_REQUIRED" });

      const admin = await user("platform_admin");
      const queue = (await taxReviewsForAdmin(identity(admin))).reviews;
      expect(queue.find(item => item.orgId === f.orgId)).toMatchObject({
        reviewReason: "es_special_territory", postalCode: "35001", taxId: saved.taxId, version: saved.version, allowed: ["non_eu_not_subject", "es_vat"],
        blocked: [{ source: "checkout", netCents: 5000 }], openOrders: [],
      });
      // Only platform admins, with a recent sign-in.
      await expect(taxReviewsForAdmin(identity(f.ownerId, null))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      const body = { version: saved.version, treatment: "non_eu_not_subject", reason };
      await expect(resolve(identity(admin, "platform_admin", 30), f.orgId, body)).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
      await expect(resolve(identity(await user("operator"), "operator"), f.orgId, body)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
      // §6.14: never a reverse charge for the Canary Islands (not an intra-EU supply), and no VIES number to give.
      await expect(resolve(identity(admin), f.orgId, { ...body, treatment: "eu_reverse_charge", viesConsultation: "WAPIAAAAZ1" })).rejects.toMatchObject({ code: "TAX_TREATMENT_NOT_ALLOWED", status: 422 });
      await expect(resolve(identity(admin), f.orgId, { ...body, viesConsultation: "WAPIAAAAZ1" })).rejects.toMatchObject({ code: "TAX_TREATMENT_NOT_ALLOWED" });
      // Reviewed a version that has changed since: refused.
      await expect(resolve(identity(admin), f.orgId, { ...body, version: saved.version + 1 })).rejects.toMatchObject({ code: "TAX_REVIEW_CHANGED", status: 409 });

      const key = randomUUID();
      const done = await resolve(identity(admin), f.orgId, body, key);
      expect(done).toEqual({ orgId: f.orgId, taxTreatment: "non_eu_not_subject", viesStatus: "not_required", version: saved.version + 1 });
      expect(await resolve(identity(admin), f.orgId, body, key)).toEqual(done);
      await expect(resolve(identity(admin), f.orgId, body)).rejects.toMatchObject({ code: "TAX_REVIEW_NOT_PENDING" });
      const [event] = await audit("billing.tax_review_resolved", f.orgId);
      expect(event).toMatchObject({ actor_id: admin, details: { reason, review_reason: "es_special_territory", postal_code: "35001",
        before: { tax_treatment: null, version: saved.version }, after: { tax_treatment: "non_eu_not_subject", version: saved.version + 1 } } });
      expect((await taxReviewsForAdmin(identity(admin))).reviews.find(item => item.orgId === f.orgId)).toBeUndefined();

      // The buyer can buy now: no Spanish IVA, "Operación no sujeta" from the treatment.
      const paid = await order(f.orgId, f.ownerId, 5000);
      expect(paid).toMatchObject({ taxTreatment: "non_eu_not_subject", vatRateBp: 0, vatCents: 0, grossCents: 5000, netCents: 5000 });
      expect(paid.taxSnapshot).toMatchObject({ country: "ES", postal_code: "35001", tax_id_kind: "es_nif" });
      // Saving the details again re-decides them: a special territory goes back to review.
      await profile(f.orgId, f.ownerId, "canarias");
      expect((await taxReviewsForAdmin(identity(admin))).reviews.find(item => item.orgId === f.orgId)).toMatchObject({ reviewReason: "es_special_territory" });
    });

    it("charges 21 % IVA when the establishment receiving the service is in the IVA territory (Ceuta, Melilla)", async () => {
      const admin = await user("platform_admin");
      for (const place of ["ceuta", "melilla"] as const) {
        const f = await workspace();
        const saved = await profile(f.orgId, f.ownerId, place);
        await resolve(identity(admin), f.orgId, { version: saved.version, treatment: "es_vat", reason: "Invoiced to the Madrid head office, which receives the service" });
        expect(await order(f.orgId, f.ownerId)).toMatchObject({ taxTreatment: "es_vat", vatRateBp: 2100, vatCents: 420, grossCents: 2420 });
      }
    });

    it("VIES unavailable: a reverse charge needs the VIES consultation number the reviewer got; otherwise 21 % IVA and VIES is asked again", async () => {
      const admin = await user("platform_admin");
      const a = await workspace();
      const first = await profile(a.orgId, a.ownerId, "vies");
      const body = { version: first.version, treatment: "eu_reverse_charge", reason: "Valid in VIES on 15 October 2026" };
      // Never "not subject" for an EU VAT number, and no reverse charge without the consultation number.
      await expect(resolve(identity(admin), a.orgId, { ...body, treatment: "non_eu_not_subject" })).rejects.toMatchObject({ code: "TAX_TREATMENT_NOT_ALLOWED" });
      await expect(resolve(identity(admin), a.orgId, body)).rejects.toMatchObject({ code: "TAX_TREATMENT_NOT_ALLOWED" });
      await expect(resolve(identity(admin), a.orgId, { ...body, viesConsultation: "<script>" })).rejects.toMatchObject({ code: "INPUT_INVALID" });
      expect(await resolve(identity(admin), a.orgId, { ...body, viesConsultation: "WAPIAAAAZ1aBcD9" })).toMatchObject({ taxTreatment: "eu_reverse_charge", viesStatus: "valid" });
      const reviewed = await tx({ orgId: a.orgId, actorId: a.ownerId }, db => getProfile(db, a.orgId));
      expect(reviewed).toMatchObject({ viesStatus: "valid", viesConsultation: "WAPIAAAAZ1aBcD9", taxTreatment: "eu_reverse_charge", taxReviewReason: null });
      expect(await order(a.orgId, a.ownerId)).toMatchObject({ taxTreatment: "eu_reverse_charge", vatCents: 0, grossCents: 2000 });

      // Not confirmed: 21 % IVA; the VIES status stays "unavailable" and the next purchase asks VIES again.
      const b = await workspace();
      const second = await profile(b.orgId, b.ownerId, "vies");
      await expect(resolve(identity(admin), b.orgId, { version: second.version, treatment: "es_vat", viesConsultation: "WAPIAAAAZ1", reason: "VIES still down" }))
        .rejects.toMatchObject({ code: "TAX_TREATMENT_NOT_ALLOWED" });
      await resolve(identity(admin), b.orgId, { version: second.version, treatment: "es_vat", reason: "VIES still down for Italy; IVA until it confirms" });
      const vat = await tx({ orgId: b.orgId, actorId: b.ownerId }, db => getProfile(db, b.orgId));
      expect(vat).toMatchObject({ viesStatus: "unavailable", taxTreatment: "es_vat", taxReviewReason: null });
      expect(await order(b.orgId, b.ownerId)).toMatchObject({ taxTreatment: "es_vat", vatCents: 420, grossCents: 2420 });
      const vies = (status: ViesResult["status"]) => async (): Promise<ViesResult> => ({ status, consultation: status === "valid" ? "WAPIAAAAZ2" : null, checkedAt: new Date() });
      // VIES still down at the next purchase: the reviewed treatment holds (before G2 it went back to review).
      expect(await refreshVies(b.owner, b.orgId, vat, randomUUID(), vies("unavailable"))).toMatchObject({ taxTreatment: "es_vat", taxReviewReason: null });
      // VIES answers valid: the reverse charge applies from then on.
      expect(await refreshVies(b.owner, b.orgId, vat, randomUUID(), vies("valid"))).toMatchObject({ taxTreatment: "eu_reverse_charge", viesStatus: "valid" });
      // A profile nobody reviewed still waits for review while VIES is down.
      const c = await workspace();
      const pending = await profile(c.orgId, c.ownerId, "vies");
      expect(await refreshVies(c.owner, c.orgId, await tx({ orgId: c.orgId, actorId: c.ownerId }, db => getProfile(db, c.orgId)), randomUUID(), vies("unavailable")))
        .toMatchObject({ taxTreatment: null, taxReviewReason: "vies_unavailable", version: pending.version + 1 });
    });

    it("refuses profiles that are not waiting for review, and records refused purchases only for those that are", async () => {
      const admin = await user("platform_admin");
      const f = await workspace();
      const saved = await profile(f.orgId, f.ownerId, "madrid");
      await expect(resolve(identity(admin), f.orgId, { version: saved.version, treatment: "non_eu_not_subject", reason })).rejects.toMatchObject({ code: "TAX_REVIEW_NOT_PENDING" });
      await expect(resolve(identity(admin), (await workspace()).orgId, { version: 1, treatment: "es_vat", reason })).rejects.toMatchObject({ code: "BILLING_PROFILE_REQUIRED" });
      expect(await tx({ orgId: f.orgId, actorId: f.ownerId }, async db => (await db.query("SELECT billing.record_blocked_top_up($1,2000) AS r", [f.orgId])).rows[0].r)).toBe(false);
      // Customers cannot set their own treatment.
      await expect(tx({ orgId: f.orgId, actorId: f.ownerId }, db => db.query("SELECT billing.resolve_tax_review($1,$2,'es_vat',NULL,'Customer attempt',NULL)", [f.orgId, saved.version])))
        .rejects.toThrow("SCOPE_DENIED");
    });
  });

  /* -------------------------------------------------------- rollback --- */

  it("the 112 rollback refuses once a price check was acknowledged", async () => {
    const down = await owner.connect();
    try {
      await down.query("BEGIN");
      await expect(down.query(readFileSync("db/rollbacks/112_billing_low_balance_threshold_down.sql", "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "")))
        .rejects.toThrow("Rollback blocked: price checks were acknowledged");
    } finally { await down.query("ROLLBACK"); down.release(); }
    // Without settings or acknowledgements it applies (inside a transaction that is rolled back).
    const clean = await owner.connect();
    try {
      await clean.query("BEGIN");
      await clean.query("SET LOCAL session_replication_role = replica");
      await clean.query("DELETE FROM billing.price_check_ack");
      await clean.query("DELETE FROM billing.alert_setting");
      await clean.query("SET LOCAL session_replication_role = origin");
      await clean.query(readFileSync("db/rollbacks/112_billing_low_balance_threshold_down.sql", "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
      expect((await clean.query("SELECT to_regclass('billing.alert_setting') AS t, to_regprocedure('billing.resolve_tax_review(uuid,bigint,text,text,text,text)') AS f")).rows[0])
        .toEqual({ t: null, f: null });
      expect((await clean.query("SELECT prosrc LIKE '%unusual_spend%' AS has FROM pg_proc WHERE proname='notification_email_recipients'")).rows[0].has).toBe(false);
    } finally { await clean.query("ROLLBACK"); clean.release(); }
  });
});
