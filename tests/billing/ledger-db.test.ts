/**
 * Credit ledger on the production schema (migration 084, spec §6.9): the
 * invariants under concurrency, idempotent replays, append-only entries, role
 * and tenant isolation, expiry, corrections, and the lock order shared with
 * the existing euro budget ledger. Runs against scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { reserve, settle } from "../../lib/evals/budget/ledger";
import { createPrefixedId } from "../../lib/operator/ids";
import {
  adjustCredits, attemptHoldKey, captureCredits, chargeAction, CreditsExhausted, expireDue, getCreditAccount, grantCredits,
  holdCredits, recordVerification, refundRun, releaseCredits, reverseEntry, unitActionKey, verifyAccounts,
} from "../../lib/billing/ledger";
import { allocateOldestExpiringFirst, creditsToUcr, splitCapture } from "../../lib/billing/units";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const SYSTEM = "service:evals-scheduler";
const WORKER = "service:evals-worker";
const c = (credits: number | string) => creditsToUcr(credits);
const B = (value: number) => BigInt(value);

function rolePool(role: string, max: number) {
  const pool = new Pool({ connectionString: ownerUrl, max });
  pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
  return pool;
}
/** Deterministic PRNG for the property tests. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("credit ledger on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 24 });
  const worker = rolePool("evals_worker", 30);
  const browser = rolePool("evals_browser", 4);
  const scheduler = rolePool("evals_scheduler", 8);
  afterAll(async () => { await Promise.all([owner, runtime, worker, browser, scheduler].map(pool => pool.end())); });

  const tx = <T>(pool: Pool, scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, pool);
  const system = (orgId: string) => ({ orgId, actorId: SYSTEM });
  const engine = (orgId: string) => ({ orgId, actorId: WORKER });

  async function user(platformAdmin = false) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Billing fixture", `${randomUUID()}@example.test`]);
    if (platformAdmin) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [id]);
    return id;
  }
  async function seed() {
    const ownerId = await user(), orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Billing fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    return { orgId, ownerId, customer: { orgId, actorId: ownerId } };
  }
  const grant = (orgId: string, credits: number, extra: Partial<Parameters<typeof grantCredits>[1]> = {}) =>
    tx(scheduler, system(orgId), db => grantCredits(db, { orgId, key: `grant-${randomUUID()}`, amountUcr: c(credits), source: "grant", ...extra }));
  const account = async (orgId: string) => (await owner.query("SELECT available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0] as { available_ucr: string; held_ucr: string };
  const balances = async (orgId: string) => { const row = await account(orgId); return { available: BigInt(row.available_ucr), held: BigInt(row.held_ucr) }; };
  const issues = async (orgId: string) => (await tx(scheduler, system(orgId), db => verifyAccounts(db, orgId)))[0].issues;
  const entries = async (orgId: string) => Number((await owner.query("SELECT count(*) FROM billing.ledger_entry WHERE org_id=$1", [orgId])).rows[0].count);

  it("gives every workspace one zero-balance account whose mode follows its plan", async () => {
    const f = await seed();
    expect((await owner.query("SELECT billing_mode,available_ucr,held_ucr,frozen_reason FROM billing.credit_account WHERE org_id=$1", [f.orgId])).rows[0])
      .toEqual({ billing_mode: "contract", available_ucr: "0", held_ucr: "0", frozen_reason: null });
    await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [f.orgId]);
    expect((await owner.query("SELECT billing_mode FROM billing.credit_account WHERE org_id=$1", [f.orgId])).rows[0].billing_mode).toBe("free");
    // Self-serve sign-up from the demo: a free workspace gets a free account.
    const digest = randomUUID().replaceAll("-", "").repeat(2), email = `${randomUUID()}@example.test`;
    const enrolled = await tx(runtime, { orgId: "", actorId: "" }, async db => {
      await db.query("SELECT evals.request_self_serve_signup($1,$2,'Self-serve fixture',NULL,'en')", [digest, email]);
      return (await db.query("SELECT * FROM evals.enroll_self_serve($1,'Fixture',$2,$3,$4)", [digest, "x".repeat(64), createPrefixedId("au"), createPrefixedId("aa")])).rows[0];
    });
    expect((await owner.query("SELECT billing_mode FROM billing.credit_account WHERE org_id=$1", [enrolled.org_id])).rows[0].billing_mode).toBe("free");
    expect(Number((await owner.query("SELECT count(*) FROM evals.workspace w WHERE NOT EXISTS (SELECT 1 FROM billing.credit_account a WHERE a.org_id=w.id)")).rows[0].count)).toBe(0);
  });

  it("holds, captures capped at the hold, releases the rest and keeps exact balances", async () => {
    const f = await seed(), w = engine(f.orgId), run = randomUUID();
    await grant(f.orgId, 1000);
    const [a1, a2, a3] = [randomUUID(), randomUUID(), randomUUID()];
    const hold = await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: attemptHoldKey(a1), amountUcr: c(300), runId: run, attemptId: a1 }));
    expect(hold).toMatchObject({ entryType: "hold", amountUcr: B(0), availableDeltaUcr: -c(300), heldDeltaUcr: c(300), availableAfterUcr: c(700), heldAfterUcr: c(300), runId: run, attemptId: a1, actorKind: "worker" });
    const first = await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: attemptHoldKey(a1), amountUcr: c(500), metadata: { input_tokens: 10 } }));
    expect(first.capture).toMatchObject({ entryType: "capture", amountUcr: -c(300), heldAfterUcr: B(0), availableAfterUcr: c(700), runId: run });
    expect(first.capture.metadata).toMatchObject({ requested_ucr: Number(c(500)), overage_ucr: Number(c(200)), input_tokens: 10 });
    expect(first.release).toBeNull();
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: attemptHoldKey(a2), amountUcr: c(200) }));
    const second = await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: attemptHoldKey(a2), amountUcr: c(50) }));
    expect(second.capture.amountUcr).toBe(-c(50));
    expect(second.release).toMatchObject({ entryType: "release", availableDeltaUcr: c(150), heldDeltaUcr: -c(150), availableAfterUcr: c(650), heldAfterUcr: B(0) });
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: attemptHoldKey(a3), amountUcr: c(100) }));
    const released = await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: attemptHoldKey(a3), reason: "attempt_failed" }));
    expect(released).toMatchObject({ entryType: "release", availableAfterUcr: c(650), heldAfterUcr: B(0), reason: "attempt_failed" });
    // Every hold ends captured or released exactly once.
    expect((await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: attemptHoldKey(a3) }))).id).toBe(released.id);
    await expect(tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: attemptHoldKey(a3), amountUcr: c(1) }))).rejects.toMatchObject({ code: "HOLD_NOT_OPEN" });
    await expect(tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: attemptHoldKey(a1) }))).rejects.toMatchObject({ code: "HOLD_NOT_OPEN" });
    await expect(tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: "attempt:missing" }))).rejects.toMatchObject({ code: "HOLD_NOT_FOUND" });
    await expect(tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:too-much", amountUcr: c(651) }))).rejects.toBeInstanceOf(CreditsExhausted);
    expect((await owner.query("SELECT hold_key,state,captured_ucr,released_ucr FROM billing.credit_hold WHERE org_id=$1 ORDER BY created_at,hold_key", [f.orgId])).rows.map(row => row.state).sort())
      .toEqual(["captured", "captured", "released"]);
    expect(await balances(f.orgId)).toEqual({ available: c(650), held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("takes lots oldest-expiring first, never-expiring last, and captures from the hold's lots in order", async () => {
    const f = await seed(), w = engine(f.orgId), soon = new Date(Date.now() + 10 * 86_400_000);
    const lotOf = (e: { lotAllocations: { lotId: string }[] }) => e.lotAllocations[0].lotId;
    const later = await grant(f.orgId, 100, { expiresAt: new Date(Date.now() + 60 * 86_400_000) });
    const first = await grant(f.orgId, 100, { expiresAt: soon });
    const never = await grant(f.orgId, 100, { expiresAt: null });
    const second = await grant(f.orgId, 100, { expiresAt: soon });
    const lots = (await owner.query("SELECT id,remaining_ucr,held_ucr,expires_at,created_at FROM billing.credit_lot WHERE org_id=$1", [f.orgId])).rows
      .map(row => ({ id: row.id, remainingUcr: BigInt(row.remaining_ucr), heldUcr: BigInt(row.held_ucr), expiresAt: row.expires_at, createdAt: row.created_at }));
    const model = allocateOldestExpiringFirst(lots, c(250));
    const hold = await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:order", amountUcr: c(250) }));
    expect(hold.lotAllocations).toEqual([{ lotId: lotOf(first), ucr: c(100) }, { lotId: lotOf(second), ucr: c(100) }, { lotId: lotOf(later), ucr: c(50) }]);
    expect(hold.lotAllocations).toEqual(model.allocations);
    const { capture, release } = await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:order", amountUcr: c(120) }));
    expect(capture.lotAllocations).toEqual([{ lotId: lotOf(first), ucr: c(100) }, { lotId: lotOf(second), ucr: c(20) }]);
    expect(release!.lotAllocations).toEqual([{ lotId: lotOf(second), ucr: c(80) }, { lotId: lotOf(later), ucr: c(50) }]);
    const action = await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unitActionKey(randomUUID()), meter: "website_question", amountUcr: c(130) }));
    expect(action.lotAllocations).toEqual([{ lotId: lotOf(second), ucr: c(80) }, { lotId: lotOf(later), ucr: c(50) }]);
    expect((await owner.query("SELECT remaining_ucr FROM billing.credit_lot WHERE id=$1", [lotOf(never)])).rows[0].remaining_ucr).toBe(String(c(100)));
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("returns the original entry on replay and raises IDEMPOTENCY_CONFLICT for different values", async () => {
    const f = await seed(), w = engine(f.orgId), s = system(f.orgId), admin = { orgId: f.orgId, actorId: await user(true) };
    const conflict = { code: "IDEMPOTENCY_CONFLICT" };
    const g = await tx(scheduler, s, db => grantCredits(db, { orgId: f.orgId, key: "grant-replay", amountUcr: c(500), source: "promo", campaign: "design-partner" }));
    // Default expiries are day-aligned, so a retry relying on them replays.
    expect((await tx(scheduler, s, db => grantCredits(db, { orgId: f.orgId, key: "grant-replay", amountUcr: c(500), source: "promo", campaign: "design-partner" }))).id).toBe(g.id);
    await expect(tx(scheduler, s, db => grantCredits(db, { orgId: f.orgId, key: "grant-replay", amountUcr: c(501), source: "promo", campaign: "design-partner" }))).rejects.toMatchObject(conflict);
    // Ten simultaneous identical holds make one hold and one entry.
    const holds = await Promise.all(Array.from({ length: 10 }, () => tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:replay", amountUcr: c(40) }))));
    expect(new Set(holds.map(h => h.id)).size).toBe(1);
    await expect(tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:replay", amountUcr: c(41) }))).rejects.toMatchObject(conflict);
    const cap = await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:replay", amountUcr: c(10) }));
    const again = await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:replay", amountUcr: c(10) }));
    expect([again.capture.id, again.release?.id]).toEqual([cap.capture.id, cap.release?.id]);
    await expect(tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:replay", amountUcr: c(11) }))).rejects.toMatchObject(conflict);
    const unit = unitActionKey(randomUUID());
    const action = await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unit, meter: "website_question", amountUcr: c(5) }));
    expect((await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unit, meter: "website_question", amountUcr: c(5) }))).id).toBe(action.id);
    await expect(tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unit, meter: "api_question", amountUcr: c(5) }))).rejects.toMatchObject(conflict);
    const adjusted = await tx(runtime, admin, db => adjustCredits(db, { orgId: f.orgId, key: "adjust-replay", amountUcr: -c(3), reason: "Duplicate courtesy credit" }));
    expect((await tx(runtime, admin, db => adjustCredits(db, { orgId: f.orgId, key: "adjust-replay", amountUcr: -c(3), reason: "Duplicate courtesy credit, retried" }))).id).toBe(adjusted.id);
    await expect(tx(runtime, admin, db => adjustCredits(db, { orgId: f.orgId, key: "adjust-replay", amountUcr: c(3), reason: "Duplicate courtesy credit" }))).rejects.toMatchObject(conflict);
    const reversal = await tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-replay", entryId: action.id, reason: "Grader fix" }));
    expect((await tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-replay", entryId: action.id, reason: "Grader fix" }))).id).toBe(reversal.id);
    await expect(tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-replay", entryId: adjusted.id, reason: "Grader fix" }))).rejects.toMatchObject(conflict);
    // grant, hold, capture + release, action, adjustment, reversal: replays added nothing.
    expect(await entries(f.orgId)).toBe(7);
    expect(await balances(f.orgId)).toEqual({ available: c(500 - 10 - 5 - 3 + 5), held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("rejects UPDATE, DELETE and TRUNCATE on ledger entries, even for the owner", async () => {
    const f = await seed();
    const g = await grant(f.orgId, 10);
    await expect(owner.query("UPDATE billing.ledger_entry SET reason='edited' WHERE id=$1", [g.id])).rejects.toThrow("LEDGER_APPEND_ONLY");
    await expect(owner.query("DELETE FROM billing.ledger_entry WHERE id=$1", [g.id])).rejects.toThrow("LEDGER_APPEND_ONLY");
    await expect(owner.query("TRUNCATE billing.ledger_entry CASCADE")).rejects.toThrow("LEDGER_APPEND_ONLY");
    expect(await entries(f.orgId)).toBe(1);
  });

  it("lets runtime and worker roles read their rows but never write a billing table or call privileged functions", async () => {
    const f = await seed(), g = await grant(f.orgId, 10), lot = g.lotAllocations[0].lotId;
    const denied = { code: "42501" };
    const writes = [
      ["INSERT INTO billing.credit_lot(org_id,source,granted_ucr,remaining_ucr) VALUES($1,'grant',1000000,1000000)", [f.orgId]],
      ["UPDATE billing.credit_account SET available_ucr=available_ucr+1000000 WHERE org_id=$1", [f.orgId]],
      ["UPDATE billing.credit_lot SET remaining_ucr=granted_ucr WHERE id=$1", [lot]],
      ["INSERT INTO billing.ledger_entry(org_id,account_version,entry_type,amount_ucr,available_delta_ucr,held_delta_ucr,available_after_ucr,held_after_ucr,idempotency_key,request_fingerprint,actor_id,actor_kind) VALUES($1,99,'grant',1,1,0,1,0,'forged','" + "a".repeat(64) + "','x','user')", [f.orgId]],
      ["DELETE FROM billing.credit_hold WHERE org_id=$1", [f.orgId]],
      ["DELETE FROM billing.ledger_entry WHERE org_id=$1", [f.orgId]],
      ["SELECT * FROM billing._post($1,'grant','forged','" + "a".repeat(64) + "',1000000,0,'[]','{}')", [f.orgId]],
      ["SELECT * FROM billing._credit($1,'grant','grant','forged','" + "a".repeat(64) + "',1000000,NULL,0,NULL,NULL,'{}')", [f.orgId]],
    ] as const;
    for (const [pool, scope] of [[runtime, f.customer], [worker, engine(f.orgId)], [browser, engine(f.orgId)], [scheduler, system(f.orgId)]] as const) {
      expect((await tx(pool, scope, db => db.query("SELECT id FROM billing.ledger_entry WHERE org_id=$1", [f.orgId]))).rowCount).toBe(1);
      for (const [sql, params] of writes) await expect(tx(pool, scope, db => db.query(sql, [...params]))).rejects.toMatchObject(denied);
    }
    // Credit creation and platform jobs are not granted to workers at all.
    for (const sql of [
      "SELECT * FROM billing.grant($1,'grant-x',1000000,'grant',NULL)",
      "SELECT * FROM billing.adjust($1,'adjust-x',1000000,'Worker correction')",
      "SELECT * FROM billing.refund_run($1,gen_random_uuid(),'Worker refund')",
      "SELECT * FROM billing.expire_due($1)",
    ]) await expect(tx(worker, engine(f.orgId), db => db.query(sql, [f.orgId]))).rejects.toMatchObject(denied);
    await expect(tx(worker, engine(f.orgId), db => db.query("SELECT * FROM billing.record_verification()"))).rejects.toMatchObject(denied);
    expect(await balances(f.orgId)).toEqual({ available: c(10), held: B(0) });
  });

  it("keeps tenants apart: no cross-workspace reads, holds, charges or verification", async () => {
    const a = await seed(), b = await seed();
    await grant(a.orgId, 50); await grant(b.orgId, 50);
    const scopeDenied = { code: "SCOPE_DENIED" };
    await tx(worker, engine(b.orgId), db => holdCredits(db, { orgId: b.orgId, key: "attempt:shared-key", amountUcr: c(5) }));
    // The same key in another workspace is a different hold.
    await tx(worker, engine(a.orgId), db => holdCredits(db, { orgId: a.orgId, key: "attempt:shared-key", amountUcr: c(7) }));
    for (const [pool, scope] of [[runtime, a.customer], [worker, engine(a.orgId)]] as const) {
      const seen = await tx(pool, scope, async db => (await db.query(`SELECT org_id FROM billing.credit_account UNION ALL SELECT org_id FROM billing.credit_lot
        UNION ALL SELECT org_id FROM billing.credit_hold UNION ALL SELECT org_id FROM billing.ledger_entry`)).rows.map(row => row.org_id));
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set([a.orgId]));
      expect(await tx(pool, scope, db => getCreditAccount(db, b.orgId))).toBeNull();
      await expect(tx(pool, scope, db => holdCredits(db, { orgId: b.orgId, key: "attempt:cross", amountUcr: c(1) }))).rejects.toMatchObject(scopeDenied);
      await expect(tx(pool, scope, db => chargeAction(db, { orgId: b.orgId, key: "unit:cross", meter: "website_question", amountUcr: c(1) }))).rejects.toMatchObject(scopeDenied);
      await expect(tx(pool, scope, db => captureCredits(db, { orgId: b.orgId, key: "attempt:shared-key", amountUcr: c(1) }))).rejects.toMatchObject(scopeDenied);
      await expect(tx(pool, scope, db => releaseCredits(db, { orgId: b.orgId, key: "attempt:shared-key" }))).rejects.toMatchObject(scopeDenied);
      await expect(tx(pool, scope, db => verifyAccounts(db, b.orgId))).rejects.toMatchObject(scopeDenied);
      await expect(tx(pool, scope, db => verifyAccounts(db, null))).rejects.toMatchObject(scopeDenied);
      expect((await tx(pool, scope, db => verifyAccounts(db, a.orgId)))[0].issues).toEqual([]);
    }
    // A scope with no workspace cannot act on any account.
    await expect(tx(worker, { orgId: "", actorId: WORKER }, db => holdCredits(db, { orgId: b.orgId, key: "attempt:none", amountUcr: c(1) }))).rejects.toMatchObject(scopeDenied);
    expect(await balances(b.orgId)).toEqual({ available: c(45), held: c(5) });
    expect(await balances(a.orgId)).toEqual({ available: c(43), held: c(7) });
  });

  it("lets only platform admins (with a reason, audited) and services create credits", async () => {
    const f = await seed(), adminId = await user(true), admin = { orgId: f.orgId, actorId: adminId };
    const scopeDenied = { code: "SCOPE_DENIED" };
    const ops = (scope: TenantContext, key: string, reason?: string) => tx(runtime, scope, db => grantCredits(db, { orgId: f.orgId, key, amountUcr: c(100), source: "grant", reason }));
    await expect(ops(f.customer, "grant-customer", "I would like credits")).rejects.toMatchObject(scopeDenied);
    await expect(ops({ orgId: f.orgId, actorId: WORKER }, "grant-worker", "Worker grant")).rejects.toMatchObject(scopeDenied);
    await expect(tx(runtime, f.customer, db => adjustCredits(db, { orgId: f.orgId, key: "adjust-customer", amountUcr: c(100), reason: "Customer adjustment" }))).rejects.toMatchObject(scopeDenied);
    await expect(ops(admin, "grant-admin")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const granted = await ops(admin, "grant-admin", "Design partner credits");
    expect(granted).toMatchObject({ entryType: "grant", actorId: adminId, actorKind: "user", reason: "Design partner credits" });
    const audit = (await owner.query("SELECT action,details FROM evals.audit_event WHERE org_id=$1 AND subject_id=$2", [f.orgId, granted.id])).rows[0];
    expect(audit.action).toBe("billing.grant");
    expect(audit.details).toMatchObject({ entry_type: "grant", before: { available_ucr: 0, held_ucr: 0 }, after: { available_ucr: Number(c(100)), held_ucr: 0 } });
    // Services grant allowances without a reason; no audit noise.
    const allowance = await tx(scheduler, system(f.orgId), db => grantCredits(db, { orgId: f.orgId, key: "allowance-2026-10", amountUcr: c(1000), source: "allowance" }));
    expect(allowance).toMatchObject({ entryType: "allowance", actorKind: "system" });
    expect((await owner.query("SELECT 1 FROM evals.audit_event WHERE subject_id=$1", [allowance.id])).rowCount).toBe(0);
    expect((await owner.query("SELECT expires_at FROM billing.credit_lot WHERE id=$1", [allowance.lotAllocations[0].lotId])).rows[0].expires_at.getUTCDate()).toBe(1);
    await expect(tx(scheduler, system(f.orgId), db => grantCredits(db, { orgId: f.orgId, key: "purchase-direct", amountUcr: c(1), source: "purchase" as never }))).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("charges actions for completed work, refuses overdraws unless partial, and blocks holds on frozen accounts", async () => {
    const f = await seed(), w = engine(f.orgId), run = randomUUID();
    await grant(f.orgId, 10);
    const charged = await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unitActionKey(randomUUID()), meter: "website_question", amountUcr: c(5), runId: run }));
    expect(charged).toMatchObject({ entryType: "action", meter: "website_question", amountUcr: -c(5), runId: run });
    await expect(tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: "unit:over", meter: "website_question", amountUcr: c(6) }))).rejects.toBeInstanceOf(CreditsExhausted);
    const partial = await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: "unit:partial", meter: "document_page", amountUcr: c(6), quantity: "12", allowPartial: true }));
    expect(partial.amountUcr).toBe(-c(5));
    expect(partial.metadata).toMatchObject({ requested_ucr: Number(c(6)), shortfall_ucr: Number(c(1)), quantity: 12 });
    await grant(f.orgId, 10);
    await owner.query("UPDATE billing.credit_account SET frozen_reason='chargeback fixture' WHERE org_id=$1", [f.orgId]);
    await expect(tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:frozen", amountUcr: c(1) }))).rejects.toMatchObject({ code: "ACCOUNT_FROZEN" });
    // Work already done is still charged on a frozen account.
    await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: "unit:frozen", meter: "web_page", amountUcr: c(1) }));
    await owner.query("UPDATE billing.credit_account SET frozen_reason=NULL WHERE org_id=$1", [f.orgId]);
    expect(await balances(f.orgId)).toEqual({ available: c(9), held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("expires unheld credit when lots lapse, protects held credit, and expires overdue holds", async () => {
    const f = await seed(), w = engine(f.orgId), s = system(f.orgId);
    const lapsing = await grant(f.orgId, 10, { expiresAt: new Date(Date.now() + 86_400_000) });
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:protected", amountUcr: c(4) }));
    await owner.query("UPDATE billing.credit_lot SET expires_at=now()-interval '1 minute' WHERE id=$1", [lapsing.lotAllocations[0].lotId]);
    expect(await tx(scheduler, s, db => expireDue(db, { orgId: f.orgId }))).toEqual([{ orgId: f.orgId, holdsExpired: 0, lotsExpired: 1, expiredUcr: c(6) }]);
    expect(await balances(f.orgId)).toEqual({ available: B(0), held: c(4) });
    expect(await tx(scheduler, s, db => expireDue(db, { orgId: f.orgId }))).toEqual([]);
    // A spend never uses expired credit: it expires it first.
    await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: "attempt:protected" }));
    expect(await balances(f.orgId)).toEqual({ available: c(4), held: B(0) });
    await expect(tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:after", amountUcr: c(1) }))).rejects.toBeInstanceOf(CreditsExhausted);
    expect((await tx(scheduler, s, db => expireDue(db, { orgId: f.orgId })))[0]).toMatchObject({ lotsExpired: 1, expiredUcr: c(4) });
    expect((await owner.query("SELECT remaining_ucr,expired_ucr FROM billing.credit_lot WHERE id=$1", [lapsing.lotAllocations[0].lotId])).rows[0])
      .toEqual({ remaining_ucr: "0", expired_ucr: String(c(10)) });
    // Holds past their expiry are released as 'expired'.
    await grant(f.orgId, 10, { expiresAt: null });
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:stale", amountUcr: c(3) }));
    await owner.query("UPDATE billing.credit_hold SET expires_at=now()-interval '1 minute' WHERE org_id=$1 AND hold_key='attempt:stale'", [f.orgId]);
    expect((await tx(scheduler, s, db => expireDue(db, { orgId: f.orgId })))[0]).toMatchObject({ holdsExpired: 1, lotsExpired: 0 });
    const expired = await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: "attempt:stale" }));
    expect(expired).toMatchObject({ entryType: "release", reason: "hold_expired", metadata: { expired: true } });
    await expect(tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:stale", amountUcr: c(1) }))).rejects.toMatchObject({ code: "HOLD_NOT_OPEN" });
    expect((await owner.query("SELECT state FROM billing.credit_hold WHERE org_id=$1 AND hold_key='attempt:stale'", [f.orgId])).rows[0].state).toBe("expired");
    expect(await balances(f.orgId)).toEqual({ available: c(10), held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("corrects with reversal entries and refunds a run once", async () => {
    const f = await seed(), w = engine(f.orgId), s = system(f.orgId), admin = { orgId: f.orgId, actorId: await user(true) }, run = randomUUID();
    const g = await grant(f.orgId, 100, { expiresAt: null });
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:refund", amountUcr: c(30), runId: run }));
    await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: "attempt:refund", amountUcr: c(20) }));
    for (let i = 0; i < 2; i++) await tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unitActionKey(randomUUID()), meter: "website_question", amountUcr: c(5), runId: run }));
    expect(await balances(f.orgId)).toEqual({ available: c(70), held: B(0) });
    const refunds = await tx(scheduler, s, db => refundRun(db, { orgId: f.orgId, runId: run, reason: "run_failed_platform" }));
    expect(refunds.map(r => [r.entryType, r.amountUcr, r.runId])).toEqual([["refund", c(20), run], ["refund", c(5), run], ["refund", c(5), run]]);
    expect(refunds.every(r => r.reversesEntryId && r.idempotencyKey.startsWith(`run-refund:${run}:`))).toBe(true);
    expect((await tx(scheduler, s, db => refundRun(db, { orgId: f.orgId, runId: run, reason: "run_failed_platform" }))).map(r => r.id)).toEqual(refunds.map(r => r.id));
    expect(await balances(f.orgId)).toEqual({ available: c(100), held: B(0) });
    await expect(tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-refunded", entryId: refunds[1].reversesEntryId!, reason: "Again" }))).rejects.toMatchObject({ code: "ENTRY_ALREADY_REVERSED" });
    const hold = (await owner.query("SELECT id FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='hold'", [f.orgId])).rows[0].id;
    await expect(tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-hold", entryId: hold, reason: "Not allowed" }))).rejects.toMatchObject({ code: "ENTRY_NOT_REVERSIBLE" });
    await expect(tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-no-reason", entryId: g.id, reason: " " }))).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: "attempt:blocks-reversal", amountUcr: c(1) }));
    await expect(tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-grant", entryId: g.id, reason: "Granted in error" }))).rejects.toMatchObject({ code: "REVERSAL_EXCEEDS_REMAINING" });
    await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: "attempt:blocks-reversal" }));
    const reversal = await tx(runtime, admin, db => reverseEntry(db, { orgId: f.orgId, key: "reverse-grant", entryId: g.id, reason: "Granted in error" }));
    expect(reversal).toMatchObject({ entryType: "reversal", amountUcr: -c(100), reversesEntryId: g.id, availableAfterUcr: B(0) });
    expect((await owner.query("SELECT action FROM evals.audit_event WHERE subject_id=$1", [reversal.id])).rows[0].action).toBe("billing.reverse");
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("keeps every invariant under 20 parallel holds and captures per account (property runs)", async () => {
    for (const seed0 of [11, 29, 47]) {
      const random = prng(seed0);
      const accounts = await Promise.all([seed(), seed()]);
      const expected = new Map<string, bigint>();
      for (const f of accounts) {
        await grant(f.orgId, 400, { expiresAt: new Date(Date.now() + 5 * 86_400_000) });
        await grant(f.orgId, 400, { expiresAt: null });
        await grant(f.orgId, 400, { expiresAt: new Date(Date.now() + 40 * 86_400_000) });
        expected.set(f.orgId, c(1200));
      }
      const work: Promise<void>[] = [];
      for (const f of accounts) {
        const w = engine(f.orgId);
        for (let i = 0; i < 20; i++) {
          const key = `attempt:${randomUUID()}`, held = B(1 + Math.floor(random() * 50_000_000)), outcome = random();
          const requested = B(Math.floor(random() * 1.5 * Number(held))), replay = random() < 0.3;
          if (outcome < 0.75) expected.set(f.orgId, expected.get(f.orgId)! - splitCapture(requested, held).captured);
          work.push((async () => {
            await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key, amountUcr: held }));
            if (replay) await tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key, amountUcr: held }));
            if (outcome < 0.75) {
              await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key, amountUcr: requested }));
              if (replay) await tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key, amountUcr: requested }));
            } else {
              await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key }));
              if (replay) await tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key }));
            }
          })());
        }
        for (let i = 0; i < 5; i++) {
          const ucr = B(1 + Math.floor(random() * 5_000_000));
          expected.set(f.orgId, expected.get(f.orgId)! - ucr);
          work.push(tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unitActionKey(randomUUID()), meter: "website_question", amountUcr: ucr })).then(() => undefined));
        }
        expected.set(f.orgId, expected.get(f.orgId)! + c(25));
        work.push(grant(f.orgId, 25).then(() => undefined));
        work.push(tx(worker, w, db => verifyAccounts(db, f.orgId)).then(() => undefined));
      }
      const results = await Promise.allSettled(work);
      expect(results.filter(r => r.status === "rejected")).toEqual([]);
      for (const f of accounts) {
        expect(await balances(f.orgId)).toEqual({ available: expected.get(f.orgId), held: B(0) });
        expect(await issues(f.orgId)).toEqual([]);
        expect(Number((await owner.query("SELECT count(*) FROM billing.credit_hold WHERE org_id=$1 AND state='held'", [f.orgId])).rows[0].count)).toBe(0);
      }
    }
  });

  it("never overdraws: 20 parallel holds against credits for 10", async () => {
    const f = await seed(), w = engine(f.orgId);
    await grant(f.orgId, 1000);
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => tx(worker, w, db => holdCredits(db, { orgId: f.orgId, key: `attempt:race-${i}`, amountUcr: c(100) }))));
    const won = results.flatMap((r, i) => r.status === "fulfilled" ? [i] : []);
    expect(won).toHaveLength(10);
    expect(results.filter(r => r.status === "rejected").every(r => (r as PromiseRejectedResult).reason instanceof CreditsExhausted)).toBe(true);
    expect(await balances(f.orgId)).toEqual({ available: B(0), held: c(1000) });
    await Promise.all(won.map((i, n) => n % 2
      ? tx(worker, w, db => captureCredits(db, { orgId: f.orgId, key: `attempt:race-${i}`, amountUcr: c(60) }))
      : tx(worker, w, db => releaseCredits(db, { orgId: f.orgId, key: `attempt:race-${i}` }))));
    expect(await balances(f.orgId)).toEqual({ available: c(1000 - 5 * 60), held: B(0) });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("follows the budget lock order: reserve/settle then hold/capture in one transaction never deadlocks", async () => {
    const f = await seed(), w = engine(f.orgId), runId = randomUUID(), workflowId = randomUUID();
    const accountId = randomUUID(), providerId = randomUUID(), priceId = randomUUID(), workspaceBudgetId = randomUUID(), runBudgetId = randomUUID();
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'billing fixture','EUR',1000,true)", [accountId]);
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      VALUES($1,$2,'openai_compatible','https://example.test/v1','fixture-model','fixture',ARRAY['judge'],'{"text":true}',8192,512,ARRAY['test'],ARRAY['EU'],1000,1000000,16)`, [providerId, accountId]);
    await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0.000001,0.000002,0.000001,0,0,'fixture')", [priceId, providerId]);
    await owner.query("INSERT INTO evals.execution_budget(id,org_id,kind,scope_id,currency,ceiling) VALUES($1,$2,'workspace',$2,'EUR',1000),($3,$2,'run',$4,'EUR',1000)", [workspaceBudgetId, f.orgId, runBudgetId, runId]);
    await owner.query("INSERT INTO evals.execution_workflow(id,org_id,run_id,status,plan_hash,created_by) VALUES($1,$2,$3,'running',$4,'fixture')", [workflowId, f.orgId, runId, "a".repeat(64)]);
    const attempts: string[] = [];
    for (let i = 0; i < 40; i++) {
      const stepId = randomUUID(), attemptId = randomUUID(), hash = randomUUID().replaceAll("-", "").repeat(2);
      await owner.query("INSERT INTO evals.workflow_step(id,org_id,workflow_id,step_kind,input_hash,version,input) VALUES($1,$2,$3,'grade',$4,1,'{}')", [stepId, f.orgId, workflowId, hash]);
      await owner.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,1,1,$4,$5,'reserved',4096)", [attemptId, f.orgId, stepId, providerId, priceId]);
      attempts.push(attemptId);
    }
    await grant(f.orgId, 10_000);
    // claim(): provider account -> budgets -> credit account -> lots, in one transaction.
    const claim = (attemptId: string) => tx(worker, w, async db => {
      await reserve(db, { orgId: f.orgId, attemptId, accountId, workspaceBudgetId, runBudgetId, runId, amount: "0.010000000", currency: "EUR" });
      await holdCredits(db, { orgId: f.orgId, key: attemptHoldKey(attemptId), amountUcr: c(50), runId, attemptId });
    });
    // settle(): the same order on success.
    const complete = (attemptId: string) => tx(worker, w, async db => {
      await settle(db, f.orgId, attemptId, "0.004000000", "reported_usage");
      await captureCredits(db, { orgId: f.orgId, key: attemptHoldKey(attemptId), amountUcr: c(20) });
    });
    expect((await Promise.allSettled(attempts.slice(0, 20).map(claim))).filter(r => r.status === "rejected")).toEqual([]);
    const round = await Promise.allSettled([
      ...attempts.slice(0, 20).map(complete),
      ...attempts.slice(20).map(claim),
      ...Array.from({ length: 5 }, () => grant(f.orgId, 1)),
      tx(scheduler, system(f.orgId), db => expireDue(db, {})),
      tx(scheduler, system(f.orgId), db => verifyAccounts(db, null)),
      tx(worker, w, db => chargeAction(db, { orgId: f.orgId, key: unitActionKey(randomUUID()), meter: "graded_answer", amountUcr: c(1) })),
    ]);
    expect(round.filter(r => r.status === "rejected")).toEqual([]);
    expect(await balances(f.orgId)).toEqual({ available: c(10_000 + 5 - 20 * 20 - 20 * 50 - 1), held: c(20 * 50) });
    const budget = (await owner.query("SELECT reserved,settled FROM evals.provider_account WHERE id=$1", [accountId])).rows[0];
    expect(budget).toEqual({ reserved: "0.200000000", settled: "0.080000000" });
    expect(await issues(f.orgId)).toEqual([]);
  });

  it("verifier reports drift when balances and lots disagree with the ledger, and zero drift otherwise", async () => {
    const f = await seed();
    await grant(f.orgId, 10);
    await tx(worker, engine(f.orgId), db => holdCredits(db, { orgId: f.orgId, key: "attempt:drift", amountUcr: c(2) }));
    const tampered = async (sql: string) => {
      const db = await owner.connect();
      try {
        await db.query("BEGIN");
        await db.query(sql, [f.orgId]);
        await db.query("SELECT set_config('evals.org_id','',true),set_config('evals.actor_id',$1,true)", [SYSTEM]);
        return (await db.query("SELECT issues FROM billing.verify_account($1)", [f.orgId])).rows[0].issues as string[];
      } finally { await db.query("ROLLBACK"); db.release(); }
    };
    expect(await tampered("UPDATE billing.credit_account SET available_ucr=available_ucr+1 WHERE org_id=$1"))
      .toEqual(["entries_available_mismatch", "running_balance_mismatch", "lots_balance_mismatch"]);
    expect(await tampered("UPDATE billing.credit_lot SET remaining_ucr=remaining_ucr-1 WHERE org_id=$1"))
      .toEqual(["lots_balance_mismatch", "lot_ledger_mismatch"]);
    expect(await tampered("UPDATE billing.credit_hold SET state='released',released_ucr=amount_ucr,settled_at=now() WHERE org_id=$1"))
      .toEqual(["open_holds_mismatch"]);
    expect(await issues(f.orgId)).toEqual([]);
    const run = await tx(scheduler, { orgId: "", actorId: SYSTEM }, db => recordVerification(db));
    expect(run.accounts).toBeGreaterThan(0);
    expect(run.driftAccounts).toBe(0);
    expect(run.drift).toEqual([]);
  });

  it("refuses the rollback once the ledger holds rows", async () => {
    const sql = readFileSync("db/rollbacks/084_billing_core_down.sql", "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await expect(db.query(sql)).rejects.toThrow("billing rollback refused");
    } finally { await db.query("ROLLBACK"); db.release(); }
    expect((await owner.query("SELECT to_regnamespace('billing') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
