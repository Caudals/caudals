import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getPostgresPool } from "@/lib/db/client";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { addMadridDays, madridParts, madridTime, stepDueAt, tickLifecycleEmails } from "@/lib/evals/operations/lifecycle-email";
import { deliverEmailNotifications, type EmailMessage } from "@/lib/evals/operations/notifications";
import { setNotificationPreferences } from "@/lib/evals/repositories/stage-c";
import { createPrefixedId } from "@/lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const schedulerUrl = process.env.EVALS_TEST_SCHEDULER_URL;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Migration 087 on the disposable database: launch L-07 lifecycle email, categories and unsubscribe. */
describe.skipIf(!ownerUrl || !runtimeUrl || !schedulerUrl)("lifecycle email and email categories (migration 087)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  beforeAll(() => {
    // The scheduler login inherits the web runtime role, as in production.
    Object.assign(process.env, {
      EVALS_DATABASE_URL: schedulerUrl, DATABASE_URL: runtimeUrl, EVALS_APP_URL: "https://app.caudals.com",
      LIFECYCLE_EMAILS_ENABLED: "true", LIFECYCLE_EMAIL_STEPS: "all", CALCOM_LINK: "caudals/setup",
    });
  });
  afterAll(async () => {
    for (const key of ["LIFECYCLE_EMAILS_ENABLED", "LIFECYCLE_EMAIL_STEPS", "CALCOM_LINK", "BRANDED_EMAILS_ENABLED"]) delete process.env[key];
    await owner.end();
    await runtime.end();
    await getEvalsPool().end();
    await getPostgresPool().end();
  });

  /** A self-serve owner enrolled through the real sign-up functions, signed up at `signedUpAt`. */
  async function owner_(locale: "en" | "es" = "en", signedUpAt = new Date(Date.now() - 10 * 60_000)) {
    const email = `owner-${randomUUID().slice(0, 8)}@lifecycle.example`;
    const token = randomUUID(), userId = createPrefixedId("au");
    await withTenant({ orgId: "", actorId: "" }, (db) => db.query("SELECT evals.request_self_serve_signup($1,$2,'Lifecycle fixture',NULL,$3)", [sha256(token), email, locale]));
    const enrolled = await withTenant({ orgId: "", actorId: "" }, async (db) => (await db.query(
      "SELECT * FROM evals.enroll_self_serve($1,'Ana García',$2,$3,$4)", [sha256(token), "x".repeat(64), userId, createPrefixedId("aa")])).rows[0]);
    await owner.query("UPDATE evals.self_serve_signup SET consumed_at=$2 WHERE org_id=$1", [enrolled.org_id, signedUpAt]);
    return { email, userId, orgId: enrolled.org_id as string, signedUpAt };
  }
  const fakeSender = (fail: (message: EmailMessage) => boolean = () => false) => {
    const sent: EmailMessage[] = [];
    const send = vi.fn(async (message: EmailMessage) => {
      if (fail(message)) throw new Error("email_provider_rejected");
      sent.push(message);
      return { id: `msg-${sent.length}` };
    });
    return { send, sent };
  };
  const tick = (send: ReturnType<typeof fakeSender>["send"], now?: Date) => tickLifecycleEmails({ actorId: "service:evals-scheduler", send, now });
  const rows = async (userId: string) => (await owner.query("SELECT step,status,reason,attempts,locale,provider_message_id FROM evals.lifecycle_email WHERE user_id=$1 ORDER BY step", [userId])).rows;
  const to = (sent: EmailMessage[], email: string) => sent.filter((message) => message.to === email);
  /** A drafted test set in the workspace (generation job ready for review). */
  async function testSet(orgId: string, userId: string) {
    const projectId = randomUUID(), evaluationId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [userId, orgId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Lifecycle')", [projectId, orgId]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Bot','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query(`INSERT INTO evals.generation_job(org_id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,status,created_by)
        VALUES($1,$2,$3,'Tests','deployed_system',$4,'p',$5,5,'needs_review',$6)`, [orgId, evaluationId, randomUUID(), [randomUUID()], randomUUID(), userId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }

  it("keeps the candidates, tokens and dedupe log away from the web runtime", async () => {
    await expect(runtime.query("SELECT * FROM evals.lifecycle_email_candidates(10)")).rejects.toThrow(/permission denied/);
    await expect(runtime.query("SELECT * FROM evals.lifecycle_email_claim('x',$1,'d0_welcome','en')", [randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(runtime.query("SELECT count(*) FROM evals.lifecycle_email")).rejects.toThrow(/permission denied/);
    await expect(runtime.query("SELECT unsubscribe_token FROM evals.email_preference")).rejects.toThrow(/permission denied/);
  });

  it("sends D0 once, in the sign-up language, across repeated and concurrent ticks", async () => {
    const o = await owner_("es");
    const { send, sent } = fakeSender();
    await Promise.all([tick(send), tick(send), tick(send)]);
    await tick(send);
    const mine = to(sent, o.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Te damos la bienvenida a Caudals");
    expect(mine[0].html).toContain('<html lang="es"');
    expect(mine[0].idempotencyKey).toBe(`lifecycle-${o.userId}-d0_welcome`);
    const token = (await owner.query("SELECT unsubscribe_token FROM evals.email_preference WHERE user_id=$1", [o.userId])).rows[0].unsubscribe_token;
    expect(mine[0].text).toContain(`https://app.caudals.com/workspace/unsubscribe#${token}`);
    expect(mine[0].headers?.["List-Unsubscribe"]).toBe(`<https://app.caudals.com/api/evals/v1/email/unsubscribe?token=${token}>`);
    expect(await rows(o.userId)).toEqual([expect.objectContaining({ step: "d0_welcome", status: "sent", attempts: 1, locale: "es", provider_message_id: expect.stringMatching(/^msg-/) })]);
  });

  it("stops on conversion and never sends a step after its window", async () => {
    // A Tuesday 10:00 (Madrid) at least five days ago: D1 is Wednesday, D3 Friday.
    let day = new Date(Date.now() - 5 * 86400_000);
    while (madridParts(day).weekday !== 2) day = new Date(day.getTime() - 86400_000);
    const { year, month, day: date } = madridParts(day);
    const signedUpAt = madridTime(year, month, date, 10);
    const o = await owner_("en", signedUpAt);
    await testSet(o.orgId, o.userId);
    const { send, sent } = fakeSender();
    // Thursday 10:03: the welcome's two-day window has passed, and D1 finds a test set (converted).
    await tick(send, new Date(addMadridDays(signedUpAt, 2).getTime() + 3 * 60_000));
    expect(to(sent, o.email)).toHaveLength(0);
    expect(await rows(o.userId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: "d0_welcome", status: "skipped", reason: "window_passed" }),
      expect.objectContaining({ step: "d1_test_set", status: "skipped", reason: "converted" }),
    ]));
    // At D3 there is still no run, so D3 goes out, mentioning the waiting test set.
    await tick(send, new Date(stepDueAt("d3_run", { signed_up_at: signedUpAt, first_report_at: null })!.getTime() + 60_000));
    const mine = to(sent, o.email);
    expect(mine.map((message) => message.subject)).toEqual(["Run your first test"]);
    expect(mine[0].text).toContain("Your test set is waiting");
  });

  it("retries a failed send with the same key, then gives up after three attempts", async () => {
    const o = await owner_();
    const { send } = fakeSender((message) => message.to === o.email);
    for (let i = 0; i < 4; i++) await tick(send);
    const calls = send.mock.calls.map(([message]) => message).filter((message) => message.to === o.email);
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((message) => message.idempotencyKey))).toEqual(new Set([`lifecycle-${o.userId}-d0_welcome`]));
    expect(await rows(o.userId)).toEqual([expect.objectContaining({ step: "d0_welcome", status: "failed", attempts: 3, reason: "email_provider_rejected" })]);
  });

  it("unsubscribes with the emailed token, one click or from the page, and stops the sequence", async () => {
    const o = await owner_();
    const { send, sent } = fakeSender();
    await tick(send);
    const token = (await owner.query("SELECT unsubscribe_token FROM evals.email_preference WHERE user_id=$1", [o.userId])).rows[0].unsubscribe_token as string;
    const { GET, POST } = await import("@/app/api/evals/v1/email/unsubscribe/route");
    const base = "http://localhost/api/evals/v1/email/unsubscribe";
    // A link scanner's GET changes nothing.
    const scanned = await GET(new Request(`${base}?token=${token}`, { headers: { host: "localhost" } }));
    expect(scanned.status).toBe(303);
    expect(scanned.headers.get("location")).toBe(`/workspace/unsubscribe#${token}`);
    expect((await owner.query("SELECT lifecycle FROM evals.email_preference WHERE user_id=$1", [o.userId])).rows[0].lifecycle).toBe(true);
    // RFC 8058 one-click, as a mail provider sends it.
    const oneClick = await POST(new Request(`${base}?token=${token}`, { method: "POST", headers: { host: "localhost", "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));
    expect(oneClick.status).toBe(200);
    expect((await oneClick.json()).data).toEqual({ unsubscribed: true });
    // The page's button: idempotent.
    const page = await POST(new Request(base, { method: "POST", headers: { host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ token }) }));
    expect((await page.json()).data).toEqual({ unsubscribed: true });
    const unknown = await POST(new Request(base, { method: "POST", headers: { host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ token: "0".repeat(64) }) }));
    expect((await unknown.json()).data).toEqual({ unsubscribed: false });
    expect((await POST(new Request(base, { method: "POST", headers: { host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ token: "nope" }) }))).status).toBe(400);
    expect((await owner.query("SELECT lifecycle, lifecycle_unsubscribed_at IS NOT NULL AS stamped FROM evals.email_preference WHERE user_id=$1", [o.userId])).rows[0]).toEqual({ lifecycle: false, stamped: true });
    // Out of the cohort: nothing more, even when later steps fall due.
    const before = to(sent, o.email).length;
    await tick(send, new Date(Date.now() + 3 * 86400_000));
    expect(to(sent, o.email)).toHaveLength(before);
    const candidates = await withTenant({ orgId: "", actorId: "service:evals-scheduler" }, async (db) => (await db.query("SELECT user_id FROM evals.lifecycle_email_candidates(1000)")).rows);
    expect(candidates.map((row) => row.user_id)).not.toContain(o.userId);
  });

  it("excludes staff, deleted workspaces and managed or partner plans; keeps pay as you go (migration 109)", async () => {
    const staff = await owner_(), deleted = await owner_(), managed = await owner_(), partner = await owner_(), payg = await owner_(), member = await owner_();
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [staff.userId]);
    await owner.query("UPDATE evals.workspace SET deleted_at=now() WHERE id=$1", [deleted.orgId]);
    await owner.query("UPDATE evals.workspace_entitlement SET plan='managed' WHERE org_id=$1", [managed.orgId]);
    await owner.query("UPDATE evals.workspace_entitlement SET plan='partner' WHERE org_id=$1", [partner.orgId]);
    // A free workspace that bought credits moves to pay as you go (093) and stays in the sequence (L-15).
    await owner.query("UPDATE evals.workspace_entitlement SET plan='payg' WHERE org_id=$1", [payg.orgId]);
    const candidates = async () => (await withTenant({ orgId: "", actorId: "service:evals-scheduler" }, async (db) => (await db.query("SELECT user_id FROM evals.lifecycle_email_candidates(1000)")).rows)).map((row) => row.user_id);
    const ids = await candidates();
    expect(ids).toContain(member.userId);
    expect(ids).toContain(payg.userId);
    for (const excluded of [staff, deleted, managed, partner]) expect(ids).not.toContain(excluded.userId);
    // The 109 rollback restores the free-only cohort (checked in a transaction, then undone).
    const down = (await readFile(new URL("../../db/rollbacks/109_evals_lifecycle_payg_down.sql", import.meta.url), "utf8")).replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query(down);
      await client.query("SET LOCAL ROLE evals_scheduler");
      await client.query("SELECT set_config('evals.actor_id','service:evals-scheduler',true),set_config('evals.org_id','',true)");
      const restored = (await client.query("SELECT user_id FROM evals.lifecycle_email_candidates(1000)")).rows.map((row) => row.user_id);
      expect(restored).toContain(member.userId);
      expect(restored).not.toContain(payg.userId);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect(await candidates()).toContain(payg.userId);
  });

  it("saves email categories per person, keeps the legacy switch meaning, and routes notices by category and language", async () => {
    const o = await owner_("es");
    const editorId = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [editorId, "Editor", `editor-${randomUUID().slice(0, 8)}@lifecycle.example`]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'editor')", [o.orgId, editorId]);
    const scope = { orgId: o.orgId, actorId: o.userId };
    // A client from before L-07 sends only the single switch.
    expect(await setNotificationPreferences(scope, { completion: true, requiredInput: false, failure: true, email: true }))
      .toMatchObject({ email: true, emailCompletion: true, emailRequiredInput: false, emailFailure: true, emailBilling: true, emailRegressions: true });
    const saved = await setNotificationPreferences(scope, {
      completion: true, requiredInput: true, failure: true, emailCompletion: true, emailRequiredInput: false, emailFailure: false,
      emailBilling: false, emailRegressions: true, lifecycle: false, locale: "es",
    });
    expect(saved).toMatchObject({ email: true, emailCompletion: true, emailFailure: false, emailBilling: false, lifecycle: false, locale: "es" });
    // Re-enabling lifecycle email clears the opt-out stamp.
    await setNotificationPreferences(scope, { completion: true, requiredInput: true, failure: true, emailCompletion: true, lifecycle: true });
    expect((await owner.query("SELECT lifecycle, lifecycle_unsubscribed_at FROM evals.email_preference WHERE user_id=$1", [o.userId])).rows[0]).toEqual({ lifecycle: true, lifecycle_unsubscribed_at: null });
    const recipients = (kind: string) => withTenant(scope, async (db) => (await db.query("SELECT * FROM evals.notification_email_recipients($1,$2)", [o.orgId, kind])).rows);
    expect(await recipients("report_published")).toEqual([expect.objectContaining({ user_id: o.userId, locale: "es" })]);
    expect(await recipients("run_failed")).toEqual([]);
    // Billing alerts go to owners unless switched off; editors never get them.
    expect(await recipients("low_balance")).toEqual([]);
    await setNotificationPreferences(scope, { completion: true, requiredInput: true, failure: true, emailCompletion: true, emailBilling: true });
    expect((await recipients("low_balance")).map((row) => row.user_id)).toEqual([o.userId]);
    // A workspace whose only notice is a ready test set is now picked up, and the branded email goes out in Spanish.
    await owner.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at) VALUES($1,$2,'test_set_ready','workspace',$3,'delivered',now())`,
      [o.orgId, `generation_job:${randomUUID()}:needs_review`, JSON.stringify({ evaluationId: randomUUID() })]);
    const due = await withTenant({ orgId: "", actorId: o.userId }, async (db) => (await db.query("SELECT evals.notification_due_workspaces() AS id")).rows.map((row) => row.id));
    expect(due).toContain(o.orgId);
    process.env.BRANDED_EMAILS_ENABLED = "true";
    const { send, sent } = fakeSender();
    expect(await deliverEmailNotifications(scope, send)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]).toMatchObject({ to: o.email, subject: "Tu conjunto de pruebas de Caudals está listo para revisar", idempotencyKey: expect.stringMatching(/^notification-/) });
    expect(sent[0].html).toContain("tab=notifications");
    expect(await deliverEmailNotifications(scope, send)).toEqual({ sent: 0, failed: 0 });
    delete process.env.BRANDED_EMAILS_ENABLED;
  });

  it("the rollback refuses while lifecycle records or opt-outs exist", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/087_evals_lifecycle_email_down.sql", import.meta.url), "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/Rollback blocked: \d+ lifecycle email records and \d+ opt-outs exist/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.lifecycle_email') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });

  it("the rollback restores the 065 functions once nothing was sent (checked in a transaction, then undone)", async () => {
    const sql = (await readFile(new URL("../../db/rollbacks/087_evals_lifecycle_email_down.sql", import.meta.url), "utf8"))
      .replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM evals.lifecycle_email");
      await client.query("DELETE FROM evals.email_preference");
      await client.query(sql);
      expect((await client.query("SELECT pg_get_function_result('evals.notification_email_recipients(uuid,text)'::regprocedure) AS result")).rows[0].result).toBe("TABLE(user_id text, email text)");
      expect((await client.query("SELECT to_regclass('evals.email_preference') AS t")).rows[0].t).toBeNull();
      expect((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='evals' AND table_name='notification_preference' AND column_name LIKE 'email\\_%'")).rows[0].n).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.email_preference') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
