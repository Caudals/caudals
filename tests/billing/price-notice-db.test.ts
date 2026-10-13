/**
 * Price-increase notice rules on the production schema (migration 094,
 * launch L-16, spec §6.4): a revision that raises a rate takes effect only
 * when its notice went out at least 30 days before its date (otherwise the
 * previous revision stays in effect and the held revision can go back to a
 * draft), a notice is recorded once and never after the deadline, recipients
 * are the owners of credit workspaces that used a raised model in the last
 * 90 days (contract workspaces excluded), decreases apply at once, and the
 * console's notice API sends tests only to the internal address unless
 * BILLING_PRICE_NOTICES=owners. Database rules run in transactions that are
 * rolled back; the API test cleans up after itself. Run on its own (I-12).
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrefixedId } from "../../lib/operator/ids";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { createPriceBookDraft } from "../../lib/billing/price-book";
import { noticeActionForAdmin, noticeSatisfied, noticeState, type SendEmail } from "../../lib/billing/price-notice";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const REV1 = "6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88";
const REV2 = "9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05";
const BOOK_FX = { usdPerEur: "1.1605", date: "2026-08-19", source: "ECB reference rate" };
const GEMINI_UP = { provider: "google", modelId: "gemini-3.8-flash", minInputTokens: 0, usdInputPerM: "1.50", usdOutputPerM: "7.50" };

describe("notice rule (pure)", () => {
  it("allows a non-raising revision, and a raising one only with a notice 30 days ahead", () => {
    const at = new Date("2027-01-01T00:00:00Z");
    expect(noticeSatisfied(false, null, at)).toBe(true);
    expect(noticeSatisfied(true, null, at)).toBe(false);
    expect(noticeSatisfied(true, new Date("2026-12-02T00:00:00Z"), at)).toBe(true);
    expect(noticeSatisfied(true, new Date("2026-12-02T00:00:01Z"), at)).toBe(false);
  });
});

describe.skipIf(!ownerUrl || !runtimeUrl)("price-increase notices on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const env = { ...process.env };
  beforeAll(() => { process.env.EVALS_DATABASE_URL = runtimeUrl; process.env.BILLING_STRIPE_MODE = "test"; });
  afterAll(async () => { process.env = env; await owner.end(); });

  /**
   * Runs `fn` as the scheduler's service identity in a transaction that is
   * always rolled back, starting from the seeded price book (revision 1 in
   * effect, revision 2 scheduled): revisions other suites created on this
   * database go back to drafts for the length of the transaction.
   */
  async function rolledBack(fn: (db: PoolClient) => Promise<void>) {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id','service:evals-scheduler',true), set_config('evals.org_id','',true)");
      await replica(db, `UPDATE billing.price_book_revision SET status='draft', effective_at=NULL, raises_prices=NULL, scheduled_at=NULL, scheduled_by=NULL,
        activated_at=NULL, retired_at=NULL, notice_sent_at=NULL WHERE revision > 2`);
      await replica(db, "UPDATE billing.price_book_revision SET status='active', retired_at=NULL WHERE revision=1");
      await replica(db, `UPDATE billing.price_book_revision SET status='scheduled', effective_at='2027-01-01T00:00:00Z', notice_sent_at=NULL, raises_prices=true,
        scheduled_at=coalesce(scheduled_at, now()), scheduled_by=coalesce(scheduled_by, 'system:migration-088'), activated_at=NULL, retired_at=NULL WHERE revision=2`);
      await fn(db);
    } finally { await db.query("ROLLBACK"); db.release(); }
  }
  async function fails(db: PoolClient, sql: string, params: unknown[], message: string) {
    await db.query("SAVEPOINT expect_failure");
    await expect(db.query(sql, params)).rejects.toThrow(message);
    await db.query("ROLLBACK TO SAVEPOINT expect_failure");
  }
  const replica = async (db: PoolClient, sql: string, params: unknown[] = []) => {
    await db.query("SET LOCAL session_replication_role = replica");
    const result = await db.query(sql, params);
    await db.query("SET LOCAL session_replication_role = origin");
    return result;
  };
  const inEffect = async (db: PoolClient, at: string) => (await db.query("SELECT revision FROM billing.price_book_at($1::timestamptz)", [at])).rows[0].revision as number;

  /** A workspace (plan and owner) whose engine used Gemini 3.8 Flash `daysAgo` days ago. Committed when `db` is a pool. */
  async function geminiUser(db: Pool | PoolClient, plan: "payg" | "managed", daysAgo = 3) {
    const ownerId = createPrefixedId("au"), orgId = randomUUID(), email = `${randomUUID()}@example.test`;
    await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [ownerId, "Notice fixture", email]);
    await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [orgId, `Notice fixture ${plan}`, ownerId]);
    await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    await db.query(`INSERT INTO evals.workspace_entitlement(org_id,plan,max_active_runs,monthly_spend_limit,currency,allowed_connection_types,updated_by)
      VALUES($1,$2,1,0,'EUR',ARRAY['website'],'fixture') ON CONFLICT (org_id) DO UPDATE SET plan=EXCLUDED.plan`, [orgId, plan]);
    const insert = async (client: PoolClient) => {
      const revision = (await client.query(`INSERT INTO evals.provider_revision(account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm)
        VALUES($1,'openai_compatible','https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.8-flash','fixture',ARRAY['judge'],'{}'::jsonb,1000,100,ARRAY['synthetic'],ARRAY['eu'],60,1000)
        RETURNING id`, [randomUUID()])).rows[0].id as string;
      await client.query(`INSERT INTO evals.execution_attempt(org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound,created_at)
        VALUES($1,$2,1,1,$3,$4,'completed',100,now()-make_interval(days=>$5))`, [orgId, randomUUID(), revision, randomUUID(), daysAgo]);
    };
    // Foreign keys off (session_replication_role): the attempt has no workflow behind it.
    if (db instanceof Pool) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL session_replication_role = replica");
        await insert(client);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } else {
      await db.query("SET LOCAL session_replication_role = replica");
      try { await insert(db); } finally { await db.query("SET LOCAL session_replication_role = origin"); }
    }
    return { orgId, ownerId, email };
  }

  it("holds an increase without a timely notice; a notice recorded in time lets it take effect; a missed one can go back to draft", async () => {
    await rolledBack(async db => {
      expect(await inEffect(db, "2027-01-02T00:00:00Z")).toBe(1);
      const increases = (await db.query("SELECT kind, model_id, after_ucr->>'input' AS input FROM billing.price_increases($1)", [REV2])).rows;
      expect(increases).toEqual([{ kind: "model", model_id: "gemini-3.8-flash", input: "195000000" }]);
      // Recorded once, 30 days ahead: the revision then applies on its date.
      const sent = (await db.query("SELECT notice_sent_at FROM billing.record_price_notice($1,'{}'::jsonb)", [REV2])).rows[0].notice_sent_at;
      expect((await db.query("SELECT notice_sent_at FROM billing.record_price_notice($1,'{}'::jsonb)", [REV2])).rows[0].notice_sent_at).toEqual(sent);
      expect(await inEffect(db, "2027-01-02T00:00:00Z")).toBe(2);
      expect(await inEffect(db, new Date().toISOString())).toBe(1);
      await fails(db, "UPDATE billing.price_book_revision SET notice_sent_at=NULL WHERE id=$1", [REV2], "PRICE_BOOK_IMMUTABLE");
      // Too late: less than 30 days before the date.
      await replica(db, "UPDATE billing.price_book_revision SET notice_sent_at=NULL, effective_at=now()+interval '10 days' WHERE id=$1", [REV2]);
      await fails(db, "SELECT * FROM billing.record_price_notice($1,'{}'::jsonb)", [REV2], "NOTICE_TOO_LATE");
      // Its date passed without a notice: held, not activated, can go back to draft.
      await replica(db, "UPDATE billing.price_book_revision SET effective_at=now()-interval '1 hour' WHERE id=$1", [REV2]);
      expect(await inEffect(db, new Date().toISOString())).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM billing.activate_due_price_books() WHERE id=$1", [REV2])).rows[0].n).toBe(0);
      await fails(db, "SELECT * FROM billing.activate_price_book($1)", [REV2], "NOTICE_NOT_SENT");
      const backToDraft = (await db.query("SELECT status, effective_at FROM billing.cancel_price_book($1)", [REV2])).rows[0];
      expect(backToDraft).toEqual({ status: "draft", effective_at: null });
    });
  });

  it("applies a revision noticed in time on its date, and never withdraws it once in effect", async () => {
    await rolledBack(async db => {
      await replica(db, "UPDATE billing.price_book_revision SET effective_at=now()-interval '1 hour', notice_sent_at=now()-interval '31 days' WHERE id=$1", [REV2]);
      expect(await inEffect(db, new Date().toISOString())).toBe(2);
      await fails(db, "SELECT * FROM billing.cancel_price_book($1)", [REV2], "PRICE_BOOK_IN_EFFECT");
      expect((await db.query("SELECT status FROM billing.activate_price_book($1)", [REV2])).rows[0].status).toBe("active");
    });
  });

  it("applies a decrease at once and refuses an increase with less than 30 days' notice", async () => {
    await rolledBack(async db => {
      await db.query("SELECT * FROM billing.cancel_price_book($1)", [REV2]);
      const down = await createPriceBookDraft(db, { title: "Gemini 3.8 Flash decrease", basedOn: REV1, fx: BOOK_FX, models: [{ ...GEMINI_UP, usdInputPerM: "0.50", usdOutputPerM: "2.50" }] });
      const scheduled = (await db.query("SELECT raises_prices, effective_at <= now() AS now FROM billing.schedule_price_book($1, now())", [down!.revision.id])).rows[0];
      expect(scheduled).toEqual({ raises_prices: false, now: true });
      expect(await inEffect(db, new Date(Date.now() + 1000).toISOString())).toBe(down!.revision.revision);
      const up = await createPriceBookDraft(db, { title: "Gemini 3.8 Flash increase", basedOn: REV1, fx: BOOK_FX, models: [GEMINI_UP] });
      await fails(db, "SELECT * FROM billing.schedule_price_book($1, now()+interval '10 days')", [up!.revision.id], "NOTICE_PERIOD_REQUIRED");
      expect((await db.query("SELECT raises_prices FROM billing.schedule_price_book($1, now()+interval '31 days')", [up!.revision.id])).rows[0].raises_prices).toBe(true);
    });
  });

  it("lists the owners of credit workspaces that used a raised model in 90 days, and writes their in-app notice", async () => {
    await rolledBack(async db => {
      const payg = await geminiUser(db, "payg");
      const managed = await geminiUser(db, "managed");
      const stale = await geminiUser(db, "payg", 120);
      const recipients = (await db.query("SELECT org_id, owner_emails, models FROM billing.price_notice_recipients($1)", [REV2])).rows;
      const ids = recipients.map(row => row.org_id);
      expect(ids).toContain(payg.orgId);
      expect(ids).not.toContain(managed.orgId);
      expect(ids).not.toContain(stale.orgId);
      expect(recipients.find(row => row.org_id === payg.orgId)).toMatchObject({ owner_emails: [payg.email], models: ["Gemini 3.8 Flash, from 1 Jan 2027 (Google)"] });
      await db.query("SELECT * FROM billing.record_price_notice($1,'{}'::jsonb)", [REV2]);
      const notice = (await db.query("SELECT kind, payload FROM evals.notification WHERE org_id=$1", [payg.orgId])).rows;
      expect(notice).toEqual([{ kind: "price_increase", payload: expect.objectContaining({ revision: 2 }) }]);
      expect((await db.query("SELECT count(*)::int AS n FROM evals.notification WHERE org_id=$1", [managed.orgId])).rows[0].n).toBe(0);
      const state = await noticeState(db, REV2, { BILLING_PRICE_NOTICES: "owners" });
      expect(state).toMatchObject({ state: "sent", noticeOk: true, mode: "owners", increases: [{ label: expect.stringContaining("Gemini 3.8 Flash"), now: "100 · 485", next: "195 · 970" }] });
    });
  });

  it("sends tests to the internal address only, refuses owner sends while internal, and sends once to owners when switched on", async () => {
    const admin = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [admin, "Notice admin", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [admin]);
    const user = await geminiUser(owner, "payg");
    const identity: EvalIdentity = { user: { id: admin, email: "admin@example.test", name: "Admin" }, platformRole: "platform_admin", workspaces: [], sessionCreatedAt: new Date().toISOString() };
    const request = () => new Request("https://app.caudals.com/api/evals/v1/billing/admin/price-book/revisions/x/notice", { method: "POST", headers: { "idempotency-key": randomUUID() } });
    // Our own raising revision after revision 2 (which stays untouched).
    const db = await owner.connect();
    let revisionId = "";
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id','service:evals-scheduler',true)");
      const draft = await createPriceBookDraft(db, { title: "Notice API fixture", basedOn: REV1, fx: BOOK_FX, models: [GEMINI_UP] });
      revisionId = draft!.revision.id;
      await db.query("SELECT * FROM billing.schedule_price_book($1,'2027-09-01T00:00:00Z')", [revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const sent: Array<{ to: string; subject: string }> = [];
    const send: SendEmail = async message => { sent.push({ to: message.to, subject: message.subject }); };
    try {
      const internal = { ...process.env, COLLABORATION_NOTIFICATION_EMAIL: "ops@caudals.test", BILLING_PRICE_NOTICES: "internal" };
      const test = await noticeActionForAdmin(request(), identity, revisionId, { orgId: user.orgId, action: "test" }, { send, env: internal });
      expect(test).toMatchObject({ action: "test", sent: 2, to: "internal" });
      expect(sent.map(item => item.to)).toEqual(["ops@caudals.test", "ops@caudals.test"]);
      expect(sent[1].subject).toMatch(/^\[test\] Las tarifas/);
      await expect(noticeActionForAdmin(request(), identity, revisionId, { orgId: user.orgId, action: "send" }, { send, env: internal })).rejects.toMatchObject({ code: "NOTICE_SENDS_INTERNAL_ONLY" });
      await expect(noticeActionForAdmin(request(), { ...identity, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() }, revisionId, { orgId: user.orgId, action: "test" }, { send, env: internal }))
        .rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
      expect((await owner.query("SELECT notice_sent_at FROM billing.price_book_revision WHERE id=$1", [revisionId])).rows[0].notice_sent_at).toBeNull();

      const owners = { ...internal, BILLING_PRICE_NOTICES: "owners" };
      sent.length = 0;
      const result = await noticeActionForAdmin(request(), identity, revisionId, { orgId: user.orgId, action: "send" }, { send, env: owners });
      expect(result).toMatchObject({ action: "send", failed: 0 });
      expect(sent.filter(item => item.to === user.email)).toHaveLength(1);
      expect((await owner.query("SELECT notice_sent_at FROM billing.price_book_revision WHERE id=$1", [revisionId])).rows[0].notice_sent_at).not.toBeNull();
      expect((await owner.query("SELECT count(*)::int AS n FROM evals.notification WHERE org_id=$1 AND kind='price_increase'", [user.orgId])).rows[0].n).toBe(1);
      // A second send records nothing new and emails nobody again.
      const before = sent.length;
      await noticeActionForAdmin(request(), identity, revisionId, { orgId: user.orgId, action: "send" }, { send, env: owners });
      expect(sent.filter(item => item.to === user.email)).toHaveLength(1);
      expect(sent.length).toBe(before);
      expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE action='billing.price_book.notice_sent' AND subject_id=$1", [revisionId])).rows[0].n).toBe(1);
    } finally {
      const cleanup = await owner.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query("SELECT set_config('evals.actor_id','service:evals-scheduler',true)");
        await cleanup.query("SELECT * FROM billing.cancel_price_book($1)", [revisionId]);
        await cleanup.query("SET LOCAL session_replication_role = replica");
        await cleanup.query("DELETE FROM evals.execution_attempt WHERE org_id=$1", [user.orgId]);
        await cleanup.query("COMMIT");
      } finally { cleanup.release(); }
    }
  });
});
