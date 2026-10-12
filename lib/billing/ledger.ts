/**
 * Typed wrappers for the credit ledger's SECURITY DEFINER functions
 * (db/migrations/084_billing_core.sql; launch spec v2 §6.9, §6.16).
 *
 * Every function takes a client inside the caller's transaction, scoped with
 * withTenant (or a worker TenantTransaction) to the workspace it acts on. The
 * database writes the entry and the balances in that transaction, so a
 * rollback undoes both. Each call is idempotent by key: a replay returns the
 * original entry; a replay with different values throws IDEMPOTENCY_CONFLICT.
 *
 * Lock order: call these after any evals budget locks in the same
 * transaction (provider account -> workspace and run budgets ->
 * billing.credit_account -> lots), never before them.
 */
import type { PoolClient } from "pg";
import { defaultExpiry, type CreditSource } from "./config";
import { MAX_OPERATION_UCR } from "./units";

export const BILLING_ERROR_CODES = [
  "IDEMPOTENCY_CONFLICT", "CREDITS_EXHAUSTED", "ACCOUNT_FROZEN", "ACCOUNT_MISSING", "HOLD_NOT_FOUND", "HOLD_NOT_OPEN",
  "SCOPE_DENIED", "INPUT_INVALID", "REASON_REQUIRED", "ENTRY_NOT_FOUND", "ENTRY_NOT_REVERSIBLE", "ENTRY_ALREADY_REVERSED",
  "REVERSAL_EXCEEDS_REMAINING", "LEDGER_APPEND_ONLY",
] as const;
export type BillingErrorCode = typeof BILLING_ERROR_CODES[number];

export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode) { super(code); this.name = "BillingError"; }
}
/** Not enough unexpired, unheld credits. The engine pauses the run with `credits_exhausted`. */
export class CreditsExhausted extends BillingError {
  constructor() { super("CREDITS_EXHAUSTED"); this.name = "CreditsExhausted"; }
}

const codes = new Set<string>(BILLING_ERROR_CODES);
function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "CREDITS_EXHAUSTED") throw new CreditsExhausted();
  if (codes.has(message)) throw new BillingError(message as BillingErrorCode);
  throw error;
}

export type EntryType = "purchase" | "grant" | "allowance" | "bonus" | "hold" | "release" | "capture" | "action" | "refund"
  | "adjustment" | "expiry" | "chargeback" | "reversal";
export type ActorKind = "user" | "system" | "worker";
export type BillingMode = "free" | "credits" | "contract";
export interface LotAllocation { lotId: string; ucr: bigint }

export interface LedgerEntry {
  id: string;
  orgId: string;
  accountVersion: bigint;
  entryType: EntryType;
  /** Signed change of available + held. Holds and releases move between the two and are 0. */
  amountUcr: bigint;
  availableDeltaUcr: bigint;
  heldDeltaUcr: bigint;
  availableAfterUcr: bigint;
  heldAfterUcr: bigint;
  lotAllocations: LotAllocation[];
  idempotencyKey: string;
  holdId: string | null;
  reversesEntryId: string | null;
  meter: string | null;
  refKind: string | null;
  refId: string | null;
  runId: string | null;
  attemptId: string | null;
  caseUnitId: string | null;
  priceBookRevisionId: string | null;
  actorId: string;
  actorKind: ActorKind;
  reason: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreditAccount {
  orgId: string; billingMode: BillingMode; availableUcr: bigint; heldUcr: bigint; frozenReason: string | null; version: bigint;
}

export interface AccountVerification {
  orgId: string; billingMode: BillingMode; availableUcr: bigint; heldUcr: bigint;
  entriesAvailableUcr: bigint; entriesHeldUcr: bigint; lotsRemainingUcr: bigint; lotsHeldUcr: bigint; openHoldsUcr: bigint;
  /** Empty when every §6.9 invariant holds for the account. */
  issues: string[];
}

type Row = Record<string, unknown>;
const big = (value: unknown) => BigInt(value as string | number);
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

function entry(row: Row): LedgerEntry {
  const allocations = (row.lot_allocations ?? []) as Array<{ lot: string; ucr: number | string }>;
  return {
    id: String(row.id), orgId: String(row.org_id), accountVersion: big(row.account_version), entryType: row.entry_type as EntryType,
    amountUcr: big(row.amount_ucr), availableDeltaUcr: big(row.available_delta_ucr), heldDeltaUcr: big(row.held_delta_ucr),
    availableAfterUcr: big(row.available_after_ucr), heldAfterUcr: big(row.held_after_ucr),
    lotAllocations: allocations.map(item => ({ lotId: item.lot, ucr: big(item.ucr) })),
    idempotencyKey: String(row.idempotency_key), holdId: text(row.hold_id), reversesEntryId: text(row.reverses_entry_id),
    meter: text(row.meter), refKind: text(row.ref_kind), refId: text(row.ref_id), runId: text(row.run_id),
    attemptId: text(row.attempt_id), caseUnitId: text(row.case_unit_id), priceBookRevisionId: text(row.price_book_revision_id),
    actorId: String(row.actor_id), actorKind: row.actor_kind as ActorKind, reason: text(row.reason), requestId: text(row.request_id),
    metadata: (row.metadata ?? {}) as Record<string, unknown>, createdAt: row.created_at as Date,
  };
}

function amount(value: bigint, allowZero = false) {
  if (value < BigInt(0) || value > MAX_OPERATION_UCR || (!allowZero && value === BigInt(0))) throw new BillingError("INPUT_INVALID");
  return value.toString();
}

async function one(db: PoolClient, sql: string, params: unknown[]): Promise<LedgerEntry> {
  try { return entry((await db.query(sql, params)).rows[0]); } catch (error) { rethrow(error); }
}
async function many(db: PoolClient, sql: string, params: unknown[]): Promise<LedgerEntry[]> {
  try { return (await db.query(sql, params)).rows.map(entry); } catch (error) { rethrow(error); }
}

/** Idempotency key for the engine hold of one attempt (§6.8 step 2). */
export const attemptHoldKey = (attemptId: string) => `attempt:${attemptId}`;
/** Idempotency key for the platform charge of one case unit (§6.8 step 5). */
export const unitActionKey = (caseUnitId: string) => `unit:${caseUnitId}`;

export type GrantSource = Exclude<CreditSource, "purchase" | "adjustment">;
export interface GrantInput {
  orgId: string; key: string; amountUcr: bigint; source: GrantSource;
  /** undefined = the D-10 default for the source; null = never expires. */
  expiresAt?: Date | null;
  /** Required when a person (a platform admin) grants. */
  reason?: string; campaign?: string; refKind?: string; refId?: string; requestId?: string;
}
/** billing.grant: a new lot of free credits (ops grant, promo, bonus or allowance). Platform admins and services only. */
export function grantCredits(db: PoolClient, input: GrantInput): Promise<LedgerEntry> {
  const expiresAt = input.expiresAt === undefined ? defaultExpiry(input.source) : input.expiresAt;
  return one(db, "SELECT * FROM billing.grant($1,$2,$3::bigint,$4,$5::timestamptz,$6,$7,$8,$9,$10)",
    [input.orgId, input.key, amount(input.amountUcr), input.source, expiresAt, input.reason ?? null, input.campaign ?? null,
      input.refKind ?? null, input.refId ?? null, input.requestId ?? null]);
}

export interface HoldInput {
  orgId: string; key: string; amountUcr: bigint;
  /** Defaults to 24 hours. */
  expiresAt?: Date; runId?: string; attemptId?: string; caseUnitId?: string; priceBookRevisionId?: string; requestId?: string;
}
/** billing.hold: reserves credits, oldest-expiring lots first. Throws CreditsExhausted or ACCOUNT_FROZEN. */
export function holdCredits(db: PoolClient, input: HoldInput): Promise<LedgerEntry> {
  return one(db, "SELECT * FROM billing.hold($1,$2,$3::bigint,$4::timestamptz,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9)",
    [input.orgId, input.key, amount(input.amountUcr), input.expiresAt ?? null, input.runId ?? null, input.attemptId ?? null,
      input.caseUnitId ?? null, input.priceBookRevisionId ?? null, input.requestId ?? null]);
}

export interface CaptureInput { orgId: string; key: string; amountUcr: bigint; requestId?: string; metadata?: Record<string, unknown> }
/**
 * billing.capture: charges min(amount, hold) and releases the rest. Returns
 * the capture entry and, when part of the hold came back, the release entry.
 */
export async function captureCredits(db: PoolClient, input: CaptureInput): Promise<{ capture: LedgerEntry; release: LedgerEntry | null }> {
  const rows = await many(db, "SELECT * FROM billing.capture($1,$2,$3::bigint,$4,$5::jsonb)",
    [input.orgId, input.key, amount(input.amountUcr, true), input.requestId ?? null, input.metadata ?? null]);
  const capture = rows.find(row => row.entryType === "capture");
  if (!capture) throw new Error("capture_missing");
  return { capture, release: rows.find(row => row.entryType === "release") ?? null };
}

export interface ReleaseInput { orgId: string; key: string; reason?: string; requestId?: string }
/** billing.release: returns the whole hold. Safe to repeat; a captured hold throws HOLD_NOT_OPEN. */
export function releaseCredits(db: PoolClient, input: ReleaseInput): Promise<LedgerEntry> {
  return one(db, "SELECT * FROM billing.release($1,$2,$3,$4)", [input.orgId, input.key, input.reason ?? null, input.requestId ?? null]);
}

export interface ActionInput {
  orgId: string; key: string; meter: string; amountUcr: bigint; quantity?: number | string;
  runId?: string; caseUnitId?: string; priceBookRevisionId?: string;
  /** Charge what is available instead of throwing CreditsExhausted; the shortfall is in metadata. */
  allowPartial?: boolean; requestId?: string;
}
/** billing.charge_action: charges a platform meter for completed work. */
export function chargeAction(db: PoolClient, input: ActionInput): Promise<LedgerEntry> {
  return one(db, "SELECT * FROM billing.charge_action($1,$2,$3,$4::bigint,$5::numeric,$6::uuid,$7::uuid,$8::uuid,$9,$10)",
    [input.orgId, input.key, input.meter, amount(input.amountUcr), String(input.quantity ?? 1), input.runId ?? null,
      input.caseUnitId ?? null, input.priceBookRevisionId ?? null, input.allowPartial ?? false, input.requestId ?? null]);
}

export interface AdjustInput { orgId: string; key: string; amountUcr: bigint; reason: string; expiresAt?: Date | null; requestId?: string }
/** billing.adjust: ops correction, + (a new lot) or − (consumes unheld credits). Reason required; audited. */
export function adjustCredits(db: PoolClient, input: AdjustInput): Promise<LedgerEntry> {
  const magnitude = input.amountUcr < BigInt(0) ? -input.amountUcr : input.amountUcr;
  amount(magnitude);
  return one(db, "SELECT * FROM billing.adjust($1,$2,$3::bigint,$4,$5::timestamptz,$6)",
    [input.orgId, input.key, input.amountUcr.toString(), input.reason, input.expiresAt ?? null, input.requestId ?? null]);
}

export interface ReverseInput { orgId: string; key: string; entryId: string; reason: string; requestId?: string }
/** billing.reverse: corrects one entry with a reversal entry against the same lots. Audited. */
export function reverseEntry(db: PoolClient, input: ReverseInput): Promise<LedgerEntry> {
  return one(db, "SELECT * FROM billing.reverse($1,$2,$3::uuid,$4,$5)",
    [input.orgId, input.key, input.entryId, input.reason, input.requestId ?? null]);
}

export interface RefundRunInput { orgId: string; runId: string; reason: string; requestId?: string }
/** billing.refund_run: refunds a run's captures and actions (key run-refund:<run_id>). */
export function refundRun(db: PoolClient, input: RefundRunInput): Promise<LedgerEntry[]> {
  return many(db, "SELECT * FROM billing.refund_run($1,$2::uuid,$3,$4)", [input.orgId, input.runId, input.reason, input.requestId ?? null]);
}

export interface ExpiryResult { orgId: string; holdsExpired: number; lotsExpired: number; expiredUcr: bigint }
/** billing.expire_due: releases expired holds and expires due lots, for one account or up to `limit` accounts. */
export async function expireDue(db: PoolClient, options: { orgId?: string; limit?: number } = {}): Promise<ExpiryResult[]> {
  try {
    const { rows } = await db.query("SELECT * FROM billing.expire_due($1::uuid,$2::int)", [options.orgId ?? null, options.limit ?? 100]);
    return rows.map(row => ({ orgId: row.org_id, holdsExpired: row.holds_expired, lotsExpired: row.lots_expired, expiredUcr: big(row.expired_ucr) }));
  } catch (error) { rethrow(error); }
}

/** billing.verify_account: the §6.9 invariants for the scoped account, or every account (services and admins). */
export async function verifyAccounts(db: PoolClient, orgId: string | null = null): Promise<AccountVerification[]> {
  try {
    const { rows } = await db.query("SELECT * FROM billing.verify_account($1::uuid)", [orgId]);
    return rows.map(row => ({
      orgId: row.org_id, billingMode: row.billing_mode, availableUcr: big(row.available_ucr), heldUcr: big(row.held_ucr),
      entriesAvailableUcr: big(row.entries_available_ucr), entriesHeldUcr: big(row.entries_held_ucr),
      lotsRemainingUcr: big(row.lots_remaining_ucr), lotsHeldUcr: big(row.lots_held_ucr), openHoldsUcr: big(row.open_holds_ucr),
      issues: row.issues as string[],
    }));
  } catch (error) { rethrow(error); }
}

export interface VerificationRun { id: string; checkedAt: Date; accounts: number; driftAccounts: number; drift: Array<{ org_id: string; issues: string[] }> }
/** billing.record_verification: the nightly verifier; checks every account and records the outcome. */
export async function recordVerification(db: PoolClient): Promise<VerificationRun> {
  try {
    const row = (await db.query("SELECT * FROM billing.record_verification()")).rows[0];
    return { id: row.id, checkedAt: row.checked_at, accounts: row.accounts, driftAccounts: row.drift_accounts, drift: row.drift };
  } catch (error) { rethrow(error); }
}

/** The scoped workspace's account, read under RLS. */
export async function getCreditAccount(db: PoolClient, orgId: string): Promise<CreditAccount | null> {
  const row = (await db.query("SELECT * FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
  if (!row) return null;
  return { orgId: row.org_id, billingMode: row.billing_mode, availableUcr: big(row.available_ucr), heldUcr: big(row.held_ucr), frozenReason: row.frozen_reason, version: big(row.version) };
}
