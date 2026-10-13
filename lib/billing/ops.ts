/**
 * The ops billing console's server side (launch spec v2 §6.13, §6.15; L-16).
 *
 * Platform admins only. Reads: account search and the account view (ledger
 * timeline, lots, holds, orders, invoices and rectifying invoices, alerts,
 * approvals, override, invariants), approvals, credit usage per workspace
 * (also platform operators), the fraud queue and credits per attempt for the
 * run inspector. Actions (sign-in within 15 minutes, an Idempotency-Key and a
 * reason): grant, adjust ±, refund credits (a failed run's charges, or one
 * entry reversed), refund money for an untouched purchase, extend an expiry,
 * freeze or unfreeze. Each writes its ledger entry and an audit event with
 * before and after values in the database.
 *
 * Two-person rule: a credit action above 10,000 credits (€100) or a money
 * refund above €100 net opens an approval request instead of running. A
 * different platform admin approves the exact payload (its SHA-256); the
 * action then runs as the approver in the approval's transaction (the
 * ledger's backstop trigger refuses large person-written entries without
 * it). Requests expire after 24 hours.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import { requireWorkspace, type EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { billingApiError } from "./api";
import { defaultExpiry } from "./config";
import { BillingError, adjustCredits, grantCredits, refundRun, reverseEntry, verifyAccounts, type LedgerEntry } from "./ledger";
import { PaymentError, getOrder, order as orderFromRow } from "./payments";
import { PRICE_BOOK_ERROR_CODES, PriceBookError, type PriceBookErrorCode } from "./price-book";
import { RefundError, SINGLE_APPROVER_REFUND_MAX_NET_CENTS, refundTopUp } from "./refunds";
import { getStripe } from "./stripe";
import { orderView } from "./top-ups";
import { UCR_PER_CREDIT, ucrToCredits } from "./units";

/** 10,000 credits (€100): above it a second platform admin approves (§6.13). */
export const TWO_PERSON_THRESHOLD_UCR = BigInt(10_000) * UCR_PER_CREDIT;
export const TWO_PERSON_THRESHOLD_CENTS = SINGLE_APPROVER_REFUND_MAX_NET_CENTS;

type Row = Record<string, unknown>;
const big = (value: unknown) => BigInt(String(value ?? 0));
const credits = (value: unknown) => ucrToCredits(big(value));
const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

/* --------------------------------------------------------------- errors --- */

const OPS_MESSAGES: Record<string, [number, string]> = {
  SECOND_APPROVER_REQUIRED: [409, "Above 10,000 credits (€100) a second platform administrator must approve this action."],
  APPROVER_MUST_DIFFER: [403, "A different platform administrator must approve this request."],
  APPROVAL_NOT_FOUND: [404, "Approval request not found."],
  APPROVAL_PAYLOAD_MISMATCH: [409, "The request is not the one you reviewed. Reload it and review it again."],
  APPROVAL_NOT_PENDING: [409, "This request is no longer waiting for approval."],
  APPROVAL_EXPIRED: [409, "This request expired after 24 hours without a second approval. Ask for a new one."],
  APPROVAL_NOT_REQUIRED: [422, "This action is within the single-administrator limit. Run it directly."],
  DISPUTE_OPEN: [409, "A payment dispute is open. The account stays frozen until Stripe closes it."],
  LOT_NOT_FOUND: [404, "Credit lot not found."],
  LOT_NOT_EXTENDABLE: [409, "Only lots with credits left that have not expired yet can be extended."],
  CREDITS_EXHAUSTED: [409, "There are not enough unheld credits for this correction."],
  ACCOUNT_FROZEN: [409, "This account is frozen."],
  ACCOUNT_MISSING: [404, "This workspace has no credit account."],
  ENTRY_NOT_FOUND: [404, "Ledger entry not found."],
  ENTRY_NOT_REVERSIBLE: [409, "This entry cannot be reversed."],
  ENTRY_ALREADY_REVERSED: [409, "This entry was already reversed or refunded."],
  REVERSAL_EXCEEDS_REMAINING: [409, "Its credits were already used or are held. Correct what is left with an adjustment."],
  NOTHING_TO_REFUND: [409, "This run has no charges left to refund."],
  IDEMPOTENCY_CONFLICT: [409, "This request key was already used for a different action. Start again."],
  REASON_REQUIRED: [422, "Give a reason of 3 to 2,000 characters."],
  INPUT_INVALID: [422, "Check the supplied fields."],
  REFUND_NOT_ALLOWED: [409, "Only an unused purchase can be refunded, within 14 days of payment."],
  ORDER_NOT_FOUND: [404, "Order not found."],
  ORDER_NOT_PAID: [409, "This order was not paid."],
  REFUND_PENDING: [503, "The credits were removed but Stripe has not confirmed the refund yet. Try again in a few minutes."],
};

/** Maps database and billing errors to the API's error shape. */
export function opsApiError(error: unknown): never {
  if (error instanceof EvalError) throw error;
  if (error instanceof PriceBookError) return billingApiError(error);
  if (error instanceof Error && (PRICE_BOOK_ERROR_CODES as readonly string[]).includes(error.message) && !OPS_MESSAGES[error.message]) {
    return billingApiError(new PriceBookError(error.message as PriceBookErrorCode));
  }
  const code = error instanceof BillingError || error instanceof PaymentError || error instanceof RefundError ? error.code
    : error instanceof Error ? error.message : "";
  if (code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 403, "A platform administrator is required.");
  const known = OPS_MESSAGES[code];
  if (known) throw new EvalError(code, known[0], known[1]);
  throw error;
}

export function opsIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "An Idempotency-Key header is required.");
  return key;
}

/** A ledger key derived from the person, the route and their Idempotency-Key (stable across retries). */
function ledgerKey(prefix: string, actorId: string, route: string, key: string) {
  return `${prefix}:${createHash("sha256").update(`${actorId}\u0000${route}\u0000${key}`).digest("hex").slice(0, 40)}`;
}

/* ---------------------------------------------------------------- views --- */

export function entryView(entry: LedgerEntry) {
  return {
    id: entry.id, type: entry.entryType, credits: ucrToCredits(entry.amountUcr), availableAfter: ucrToCredits(entry.availableAfterUcr),
    heldAfter: ucrToCredits(entry.heldAfterUcr), key: entry.idempotencyKey, reason: entry.reason, actorId: entry.actorId, actorKind: entry.actorKind,
    runId: entry.runId, refKind: entry.refKind, refId: entry.refId, reversesEntryId: entry.reversesEntryId, createdAt: entry.createdAt.toISOString(),
  };
}

function ledgerRowView(row: Row) {
  return {
    id: String(row.id), type: String(row.entry_type), credits: credits(row.amount_ucr), availableAfter: credits(row.available_after_ucr),
    heldAfter: credits(row.held_after_ucr), version: String(row.account_version), key: String(row.idempotency_key), reason: str(row.reason),
    actorId: String(row.actor_id), actorKind: String(row.actor_kind), meter: str(row.meter), runId: str(row.run_id), attemptId: str(row.attempt_id),
    refKind: str(row.ref_kind), refId: str(row.ref_id), reversesEntryId: str(row.reverses_entry_id), reversed: Boolean(row.reversed),
    createdAt: iso(row.created_at),
  };
}

export function approvalView(row: Row) {
  return {
    id: String(row.id), orgId: String(row.org_id), workspace: str(row.workspace), action: String(row.action), credits: credits(row.amount_ucr),
    netCents: row.net_cents === null || row.net_cents === undefined ? null : Number(row.net_cents), payload: row.payload as Record<string, unknown>,
    payloadSha256: String(row.payload_sha256), reason: String(row.reason), requestedBy: String(row.requested_by), requestedAt: iso(row.requested_at),
    expiresAt: iso(row.expires_at),
    status: row.status === "pending" && Date.parse(String(row.expires_at)) <= Date.now() ? "expired" : String(row.status),
    approvedBy: str(row.approved_by), approvedAt: iso(row.approved_at), decidedBy: str(row.decided_by), decidedAt: iso(row.decided_at),
    decisionReason: str(row.decision_reason), executedAt: iso(row.executed_at), result: (row.result ?? null) as Record<string, unknown> | null,
  };
}

/* -------------------------------------------------------------- actions --- */

const reason = z.string().trim().min(3).max(2000);
const futureDate = z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now(), "The date must be in the future.");
export const grantInput = z.strictObject({
  orgId: z.uuid(), credits: z.number().int().min(1).max(10_000_000), reason,
  source: z.enum(["grant", "promo"]).default("grant"),
  /** Omitted: the D-10 default for the source (30 days). */
  expiresAt: futureDate.optional(),
  campaign: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.:-]{0,79}$/).optional(),
});
export const adjustInput = z.strictObject({
  orgId: z.uuid(), credits: z.number().int().min(-10_000_000).max(10_000_000).refine(value => value !== 0, "Not zero."), reason,
  /** Positive adjustments only; omitted: 24 months (D-10). */
  expiresAt: futureDate.optional(),
});
export const creditRefundInput = z.strictObject({ orgId: z.uuid(), reason, runId: z.uuid().optional(), entryId: z.uuid().optional() })
  .refine(value => Boolean(value.runId) !== Boolean(value.entryId), "Give a run or one ledger entry.");
export const moneyRefundInput = z.strictObject({ orgId: z.uuid(), orderId: z.uuid(), reason });
export const freezeInput = z.strictObject({ orgId: z.uuid(), frozen: z.boolean(), reason });
export const expiryInput = z.strictObject({ orgId: z.uuid(), lotId: z.uuid(), expiresAt: futureDate, reason });

/** What an approval stores and runs: the resolved action, so the approver approves exactly what executes. */
export type ActionPayload =
  | { action: "grant"; credits: number; source: "grant" | "promo"; expiresAt: string; campaign: string | null; reason: string }
  | { action: "adjust"; credits: number; expiresAt: string | null; reason: string }
  | { action: "reversal"; entryId: string; reason: string }
  | { action: "run_refund"; runId: string; reason: string }
  | { action: "money_refund"; orderId: string; reason: string };

/** Credits the action moves (magnitude), read inside the caller's transaction. */
async function actionAmount(db: PoolClient, orgId: string, payload: ActionPayload): Promise<{ ucr: bigint; netCents: number | null }> {
  switch (payload.action) {
    case "grant":
    case "adjust":
      return { ucr: BigInt(Math.abs(payload.credits)) * UCR_PER_CREDIT, netCents: null };
    case "reversal": {
      const row = (await db.query("SELECT amount_ucr FROM billing.ledger_entry WHERE org_id=$1 AND id=$2", [orgId, payload.entryId])).rows[0];
      if (!row) throw new BillingError("ENTRY_NOT_FOUND");
      const amount = big(row.amount_ucr);
      return { ucr: amount < BigInt(0) ? -amount : amount, netCents: null };
    }
    case "run_refund": {
      const row = (await db.query(`SELECT coalesce(-sum(x.amount_ucr),0)::text AS total FROM billing.ledger_entry x
        WHERE x.org_id=$1 AND x.run_id=$2 AND x.entry_type IN ('capture','action') AND x.amount_ucr<0
          AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry r WHERE r.org_id=x.org_id AND r.reverses_entry_id=x.id)`, [orgId, payload.runId])).rows[0];
      return { ucr: big(row.total), netCents: null };
    }
    case "money_refund": {
      const order = await getOrder(db, orgId, payload.orderId);
      if (!order) throw new PaymentError("ORDER_NOT_FOUND");
      return { ucr: order.baseUcr + (order.bonusUcr ?? BigInt(0)), netCents: order.netCents };
    }
  }
}

/** Runs a credit action (never a money refund) with its ledger key. Returns the entries written. */
async function executeCreditAction(db: PoolClient, orgId: string, payload: ActionPayload, key: string, requestId: string): Promise<LedgerEntry[]> {
  switch (payload.action) {
    case "grant":
      return [await grantCredits(db, { orgId, key, amountUcr: BigInt(payload.credits) * UCR_PER_CREDIT, source: payload.source,
        expiresAt: new Date(payload.expiresAt), reason: payload.reason, campaign: payload.campaign ?? undefined, requestId })];
    case "adjust":
      return [await adjustCredits(db, { orgId, key, amountUcr: BigInt(payload.credits) * UCR_PER_CREDIT, reason: payload.reason,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null, requestId })];
    case "reversal":
      return [await reverseEntry(db, { orgId, key, entryId: payload.entryId, reason: payload.reason, requestId })];
    case "run_refund": {
      const entries = await refundRun(db, { orgId, runId: payload.runId, reason: payload.reason, requestId });
      if (!entries.length) throw new EvalError("NOTHING_TO_REFUND", 409, OPS_MESSAGES.NOTHING_TO_REFUND[1]);
      return entries;
    }
    case "money_refund":
      throw new Error("money_refund_is_not_a_credit_action");
  }
}

async function openApproval(db: PoolClient, orgId: string, payload: ActionPayload, amount: { ucr: bigint; netCents: number | null }, requestId: string) {
  const row = (await db.query("SELECT * FROM billing.request_approval($1,$2,$3::bigint,$4::bigint,$5::jsonb,$6,$7)",
    [orgId, payload.action, amount.ucr.toString(), amount.netCents, JSON.stringify(payload), payload.reason, requestId])).rows[0];
  return approvalView(row);
}

/** Resolves an action's request body into the payload an approval would store. */
export function actionPayload(kind: "grant" | "adjust" | "credit_refund" | "money_refund", body: unknown, now = new Date()): { orgId: string; payload: ActionPayload } {
  if (kind === "grant") {
    const input = grantInput.parse(body);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : defaultExpiry(input.source, now);
    return { orgId: input.orgId, payload: { action: "grant", credits: input.credits, source: input.source, expiresAt: expiresAt.toISOString(), campaign: input.campaign ?? null, reason: input.reason } };
  }
  if (kind === "adjust") {
    const input = adjustInput.parse(body);
    if (input.credits < 0 && input.expiresAt) throw new EvalError("INPUT_INVALID", 422, "Only a positive adjustment has an expiry.");
    const expiresAt = input.credits > 0 ? (input.expiresAt ? new Date(input.expiresAt) : defaultExpiry("adjustment", now)).toISOString() : null;
    return { orgId: input.orgId, payload: { action: "adjust", credits: input.credits, expiresAt, reason: input.reason } };
  }
  if (kind === "credit_refund") {
    const input = creditRefundInput.parse(body);
    return { orgId: input.orgId, payload: input.runId ? { action: "run_refund", runId: input.runId, reason: input.reason } : { action: "reversal", entryId: input.entryId!, reason: input.reason } };
  }
  const input = moneyRefundInput.parse(body);
  return { orgId: input.orgId, payload: { action: "money_refund", orderId: input.orderId, reason: input.reason } };
}

/**
 * POST /admin/grants · /admin/adjustments · /admin/credit-refunds: runs the
 * action, or opens an approval request above the threshold. The response is
 * replayed for the same Idempotency-Key.
 */
export async function creditActionForAdmin(request: Request, identity: EvalIdentity, kind: "grant" | "adjust" | "credit_refund", body: unknown) {
  requireRecentAuthentication(identity);
  const key = opsIdempotencyKey(request);
  const { orgId, payload } = actionPayload(kind, body);
  const scope = { orgId, actorId: identity.user.id };
  const route = `billing-admin-${kind}`;
  const requestId = randomUUID();
  return withTenant(scope, db => idempotent(db, scope, route, key, { orgId, ...payload }, async () => {
    const amount = await actionAmount(db, orgId, payload);
    if (payload.action === "run_refund" && amount.ucr === BigInt(0)) throw new EvalError("NOTHING_TO_REFUND", 409, OPS_MESSAGES.NOTHING_TO_REFUND[1]);
    if (amount.ucr > TWO_PERSON_THRESHOLD_UCR) return { outcome: "pending_approval" as const, approval: await openApproval(db, orgId, payload, amount, requestId) };
    const entries = await executeCreditAction(db, orgId, payload, ledgerKey("ops", identity.user.id, route, key), requestId);
    return { outcome: "done" as const, entries: entries.map(entryView) };
  })).catch(opsApiError);
}

/**
 * POST /admin/refunds: a money refund of an untouched purchase within 14 days.
 * Up to €100 net it runs (ledger first, then Stripe); above, it opens an
 * approval request. Stripe is test mode until Gate B (BILLING_STRIPE_MODE).
 */
export async function moneyRefundForAdmin(request: Request, identity: EvalIdentity, body: unknown, deps: { stripe?: Parameters<typeof refundTopUp>[1] } = {}) {
  requireRecentAuthentication(identity);
  const key = opsIdempotencyKey(request);
  const { orgId, payload } = actionPayload("money_refund", body);
  if (payload.action !== "money_refund") throw new EvalError("INPUT_INVALID", 422);
  const scope = { orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  try {
    const current = await withTenant(scope, db => getOrder(db, orgId, payload.orderId));
    if (!current) throw new PaymentError("ORDER_NOT_FOUND");
    if (current.netCents > TWO_PERSON_THRESHOLD_CENTS && current.status !== "refunded") {
      const approval = await withTenant(scope, db => idempotent(db, scope, "billing-admin-refunds", key, { orgId, ...payload }, async () =>
        openApproval(db, orgId, payload, await actionAmount(db, orgId, payload), requestId)));
      return { outcome: "pending_approval" as const, approval };
    }
    const done = await refundTopUp({ orgId, orderId: payload.orderId, reason: payload.reason, actorId: identity.user.id, requestId }, deps.stripe ?? getStripe());
    await withTenant(scope, db => idempotent(db, scope, "billing-admin-refunds", key, { orgId, ...payload }, async () => ({ orderId: done.id, status: done.status })));
    return { outcome: "done" as const, ...orderView(done) };
  } catch (error) {
    return opsApiError(error);
  }
}

/** GET /admin/approvals?status=open|pending|approved|executed|rejected|cancelled|expired */
export async function listApprovalsForAdmin(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const status = z.enum(["open", "pending", "approved", "executed", "rejected", "cancelled", "expired"]).nullable().parse(params.get("status") || null);
  const rows = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT * FROM billing.list_approvals($1,200)", [status])).rows).catch(opsApiError);
  return { approvals: rows.map(approvalView), thresholdCredits: ucrToCredits(TWO_PERSON_THRESHOLD_UCR), thresholdNetCents: TWO_PERSON_THRESHOLD_CENTS };
}

export const approveInput = z.strictObject({ orgId: z.uuid(), payloadSha256: z.string().regex(/^[0-9a-f]{64}$/) });

/**
 * POST /admin/approvals/:id/approve: a different platform admin approves the
 * payload they reviewed; the action runs as them. Credit actions run in the
 * approval's transaction; a money refund removes the credits, refunds in
 * Stripe and then closes the request (a retry by the same approver finishes
 * a refund Stripe had not confirmed).
 */
export async function approveForAdmin(request: Request, identity: EvalIdentity, id: string, body: unknown, deps: { stripe?: Parameters<typeof refundTopUp>[1] } = {}) {
  requireRecentAuthentication(identity);
  opsIdempotencyKey(request);
  const input = approveInput.parse(body);
  const approvalId = z.uuid().parse(id);
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  const read = () => withTenant(scope, async db => (await db.query("SELECT * FROM billing.approval_request WHERE org_id=$1 AND id=$2", [input.orgId, approvalId])).rows[0] as Row | undefined);
  try {
    const current = await read();
    if (!current) throw new EvalError("APPROVAL_NOT_FOUND", 404, OPS_MESSAGES.APPROVAL_NOT_FOUND[1]);
    const payload = current.payload as ActionPayload;
    // A replay after the action ran (by the same approver) returns its outcome.
    if (current.status === "executed" && current.approved_by === identity.user.id && current.payload_sha256 === input.payloadSha256) {
      return { outcome: "done" as const, approval: approvalView(current) };
    }
    if (payload.action === "money_refund") {
      const done = await refundTopUp({ orgId: input.orgId, orderId: payload.orderId, reason: payload.reason, actorId: identity.user.id, requestId,
        approval: { id: approvalId, payloadSha256: input.payloadSha256 } }, deps.stripe ?? getStripe());
      return { outcome: "done" as const, approval: approvalView((await read())!), order: orderView(done) };
    }
    return await withTenant(scope, async db => {
      await db.query("SELECT id FROM billing.approve_request($1,$2::uuid,$3)", [input.orgId, approvalId, input.payloadSha256]);
      const entries = await executeCreditAction(db, input.orgId, payload, `approval:${approvalId}`, requestId);
      const row = (await db.query("SELECT * FROM billing.complete_approval($1,$2::uuid,$3::jsonb)",
        [input.orgId, approvalId, JSON.stringify({ entries: entries.map(entry => entry.id) })])).rows[0];
      return { outcome: "done" as const, approval: approvalView(row), entries: entries.map(entryView) };
    });
  } catch (error) {
    return opsApiError(error);
  }
}

export const closeInput = z.strictObject({ orgId: z.uuid(), reason });
/** POST /admin/approvals/:id/close: the requester cancels, another admin rejects. */
export async function closeApprovalForAdmin(request: Request, identity: EvalIdentity, id: string, body: unknown) {
  requireRecentAuthentication(identity);
  opsIdempotencyKey(request);
  const input = closeInput.parse(body);
  const approvalId = z.uuid().parse(id);
  return withTenant({ orgId: input.orgId, actorId: identity.user.id }, async db =>
    approvalView((await db.query("SELECT * FROM billing.close_approval($1,$2::uuid,$3)", [input.orgId, approvalId, input.reason])).rows[0]))
    .catch(opsApiError);
}

/** POST /admin/freeze: freeze or unfreeze an account (fraud, chargeback). */
export async function freezeForAdmin(request: Request, identity: EvalIdentity, body: unknown) {
  requireRecentAuthentication(identity);
  const key = opsIdempotencyKey(request);
  const input = freezeInput.parse(body);
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, "billing-admin-freeze", key, input, async () => {
    const row = (await db.query("SELECT * FROM billing.set_account_freeze($1,$2,$3,$4)", [input.orgId, input.frozen, input.reason, randomUUID()])).rows[0];
    return { orgId: input.orgId, frozen: row.frozen_reason !== null, frozenReason: str(row.frozen_reason) };
  })).catch(opsApiError);
}

/** POST /admin/expiry: move a lot's expiry later. */
export async function extendExpiryForAdmin(request: Request, identity: EvalIdentity, body: unknown) {
  requireRecentAuthentication(identity);
  const key = opsIdempotencyKey(request);
  const input = expiryInput.parse(body);
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, "billing-admin-expiry", key, input, async () => {
    const row = (await db.query("SELECT * FROM billing.extend_lot_expiry($1,$2::uuid,$3::timestamptz,$4,$5)",
      [input.orgId, input.lotId, input.expiresAt, input.reason, randomUUID()])).rows[0];
    return { lotId: String(row.id), expiresAt: iso(row.expires_at), remaining: credits(row.remaining_ucr) };
  })).catch(opsApiError);
}

/* ---------------------------------------------------------------- reads --- */

/** GET /admin/accounts?q= : accounts by workspace name or id, owner email, order or Stripe id. */
export async function searchAccountsForAdmin(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const query = z.string().trim().max(200).parse(params.get("q") ?? "");
  const rows = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT * FROM billing.search_accounts($1,50)", [query || null])).rows).catch(opsApiError);
  return {
    accounts: rows.map(row => ({
      orgId: String(row.org_id), workspace: String(row.workspace), plan: str(row.plan), billingMode: String(row.billing_mode),
      available: credits(row.available_ucr), held: credits(row.held_ucr), frozenReason: str(row.frozen_reason), ownerDomain: str(row.owner_domain),
      lastEntryAt: iso(row.last_entry_at), createdAt: iso(row.created_at),
    })),
  };
}

/**
 * GET /admin/accounts/:orgId?before=<account version>: one workspace's
 * billing: account, plan, lots, holds, ledger timeline (50 per page),
 * orders, invoices and rectifying invoices, alerts, approvals, override and
 * the §6.9 invariants. The support read is audited (requireWorkspace).
 */
export async function accountForAdmin(identity: EvalIdentity, orgId: string, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const id = z.uuid().parse(orgId);
  const before = z.coerce.number().int().positive().optional().parse(params.get("before") ?? undefined);
  await requireWorkspace(identity, id, "read");
  return withTenant({ orgId: id, actorId: identity.user.id }, async db => {
    const account = (await db.query("SELECT * FROM billing.credit_account WHERE org_id=$1", [id])).rows[0];
    if (!account) throw new EvalError("ACCOUNT_MISSING", 404, OPS_MESSAGES.ACCOUNT_MISSING[1]);
    const workspace = (await db.query(`SELECT w.name,w.created_at,e.plan FROM evals.workspace w LEFT JOIN evals.workspace_entitlement e ON e.org_id=w.id WHERE w.id=$1`, [id])).rows[0];
    const lots = (await db.query(`SELECT * FROM billing.credit_lot WHERE org_id=$1 ORDER BY (remaining_ucr>0) DESC, expires_at ASC NULLS LAST, created_at DESC LIMIT 100`, [id])).rows;
    const holds = (await db.query(`SELECT id,hold_key,amount_ucr,captured_ucr,released_ucr,state,run_id,attempt_id,expires_at,created_at,settled_at FROM billing.credit_hold
      WHERE org_id=$1 AND (state='held' OR created_at>now()-interval '7 days') ORDER BY (state='held') DESC, created_at DESC LIMIT 50`, [id])).rows;
    const ledger = (await db.query(`SELECT e.*, EXISTS (SELECT 1 FROM billing.ledger_entry r WHERE r.org_id=e.org_id AND r.reverses_entry_id=e.id) AS reversed
      FROM billing.ledger_entry e WHERE e.org_id=$1 AND ($2::bigint IS NULL OR e.account_version<$2) ORDER BY e.account_version DESC LIMIT 51`, [id, before ?? null])).rows;
    const orders = (await db.query("SELECT * FROM billing.top_up_order WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50", [id])).rows;
    const documents = (await db.query(`SELECT id,kind,status,number,issue_date,net_cents,vat_cents,gross_cents,order_id,livemode,provider,created_at,
        (pdf_object_key IS NOT NULL) AS pdf_attached FROM billing.invoice_document WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50`, [id])).rows;
    const alerts = (await db.query("SELECT kind,period_key,attempts,sent_at,created_at FROM billing.alert_state WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30", [id])).rows;
    const approvals = (await db.query("SELECT * FROM billing.approval_request WHERE org_id=$1 ORDER BY requested_at DESC LIMIT 20", [id])).rows;
    const override = (await db.query("SELECT enforcement,live_payments,plans_v2,reason,version,updated_by,updated_at FROM billing.workspace_override WHERE org_id=$1", [id])).rows[0] ?? null;
    const [verification] = await verifyAccounts(db, id);
    return {
      account: {
        orgId: id, workspace: workspace ? String(workspace.name) : null, plan: str(workspace?.plan), billingMode: String(account.billing_mode),
        available: credits(account.available_ucr), held: credits(account.held_ucr), frozenReason: str(account.frozen_reason), version: String(account.version),
        issues: verification?.issues ?? [],
      },
      lots: lots.map(row => ({
        id: String(row.id), source: String(row.source), granted: credits(row.granted_ucr), remaining: credits(row.remaining_ucr), held: credits(row.held_ucr),
        expired: credits(row.expired_ucr), unitPriceEur: String(row.unit_price_eur), expiresAt: iso(row.expires_at), orderId: str(row.order_id),
        campaign: str(row.campaign), createdAt: iso(row.created_at),
        extendable: row.expires_at !== null && new Date(row.expires_at as string).getTime() > Date.now() && big(row.remaining_ucr) > BigInt(0),
      })),
      holds: holds.map(row => ({
        id: String(row.id), key: String(row.hold_key), amount: credits(row.amount_ucr), captured: credits(row.captured_ucr), released: credits(row.released_ucr),
        state: String(row.state), runId: str(row.run_id), attemptId: str(row.attempt_id), expiresAt: iso(row.expires_at), createdAt: iso(row.created_at),
        settledAt: iso(row.settled_at),
      })),
      ledger: ledger.slice(0, 50).map(ledgerRowView),
      nextBefore: ledger.length > 50 ? String(ledger[49].account_version) : null,
      orders: orders.map(row => {
        const order = orderFromRow(row);
        return { ...orderView(order), riskFlags: order.riskFlags, cardCountry: order.cardCountry, paymentIntentId: order.paymentIntentId,
          refundable: order.status === "paid" && !!order.paidAt && Date.now() - order.paidAt.getTime() < 14 * 86_400_000,
          needsSecondApprover: order.netCents > TWO_PERSON_THRESHOLD_CENTS };
      }),
      documents: documents.map(row => ({
        id: String(row.id), kind: String(row.kind), status: String(row.status), number: str(row.number), issueDate: row.issue_date ? String(row.issue_date).slice(0, 10) : null,
        grossCents: Number(row.gross_cents), orderId: str(row.order_id), livemode: Boolean(row.livemode), provider: str(row.provider), pdfAttached: Boolean(row.pdf_attached),
        createdAt: iso(row.created_at),
      })),
      alerts: alerts.map(row => ({ kind: String(row.kind), period: String(row.period_key), attempts: Number(row.attempts), sentAt: iso(row.sent_at), createdAt: iso(row.created_at) })),
      approvals: approvals.map(approvalView),
      override: override ? { enforcement: String(override.enforcement), livePayments: Boolean(override.live_payments), plansV2: Boolean(override.plans_v2),
        reason: String(override.reason), version: Number(override.version), updatedBy: String(override.updated_by), updatedAt: iso(override.updated_at) } : null,
      thresholdCredits: ucrToCredits(TWO_PERSON_THRESHOLD_UCR),
    };
  }).catch(opsApiError);
}

/** The UTC month [from, to) for YYYY-MM (default: this month). */
export function monthRange(month: string | null, now = new Date()) {
  const value = month ?? now.toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new EvalError("INPUT_INVALID", 422, "Use a month as YYYY-MM.");
  const [year, monthIndex] = value.split("-").map(Number);
  return { month: value, from: new Date(Date.UTC(year, monthIndex - 1, 1)), to: new Date(Date.UTC(year, monthIndex, 1)) };
}

/** GET /admin/usage?month=YYYY-MM: credits sold, granted, consumed, held, expired and refunded per workspace. Platform roles. */
export async function creditUsageForPlatform(identity: EvalIdentity, params: URLSearchParams) {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const range = monthRange(params.get("month"));
  const rows = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT * FROM billing.credit_usage($1,$2)", [range.from, range.to])).rows).catch(opsApiError);
  const workspaces = rows.map(row => ({
    orgId: String(row.org_id), workspace: String(row.workspace), plan: str(row.plan), billingMode: String(row.billing_mode), frozen: Boolean(row.frozen),
    available: credits(row.available_ucr), held: credits(row.held_ucr), sold: credits(row.sold_ucr), soldNetCents: Number(row.sold_net_cents),
    granted: credits(row.granted_ucr), consumed: credits(row.consumed_ucr), returned: credits(row.returned_ucr), refunded: credits(row.refunded_ucr),
    expired: credits(row.expired_ucr), shadowCharged: credits(row.shadow_charged_ucr),
  }));
  const sum = (key: "sold_ucr" | "granted_ucr" | "consumed_ucr" | "held_ucr" | "expired_ucr" | "shadow_charged_ucr" | "available_ucr") =>
    ucrToCredits(rows.reduce((total, row) => total + big(row[key]), BigInt(0)));
  return {
    month: range.month,
    totals: { sold: sum("sold_ucr"), soldNetCents: rows.reduce((total, row) => total + Number(row.sold_net_cents), 0), granted: sum("granted_ucr"),
      consumed: sum("consumed_ucr"), held: sum("held_ucr"), expired: sum("expired_ucr"), available: sum("available_ucr"), shadowCharged: sum("shadow_charged_ucr") },
    workspaces: workspaces.filter(row => row.billingMode !== "contract" || Number(row.sold) || Number(row.consumed) || Number(row.shadowCharged) || Number(row.available) || Number(row.held)
      || Number(row.granted) || Number(row.expired)),
  };
}

/** GET /admin/fraud?days=30: flagged sign-ups, top-up velocity, risk-flagged orders, disputes and frozen accounts. */
export async function fraudQueueForAdmin(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const days = z.coerce.number().int().min(1).max(365).parse(params.get("days") ?? 30);
  const data = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT billing.fraud_queue($1) AS q", [days])).rows[0].q as Record<string, unknown>).catch(opsApiError);
  const toCredits = (value: unknown) => ucrToCredits(big(value));
  const frozen = (data.frozen_accounts as Row[]).map(row => ({ ...row, available: toCredits(row.available_ucr), available_ucr: undefined }));
  return { days, ...data, frozen_accounts: frozen };
}

/**
 * GET /admin/runs/:id?orgId=: credits charged next to our cost for each
 * engine attempt of a run (real holds and captures, or shadow captures while
 * the shadow week runs), with the run's platform meters and refunds.
 * Platform roles (the run inspector).
 */
export async function runCreditsForPlatform(identity: EvalIdentity, runId: string, params: URLSearchParams) {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const orgId = z.uuid().parse(params.get("orgId"));
  const id = z.uuid().parse(runId);
  await requireWorkspace(identity, orgId, "read");
  return withTenant({ orgId, actorId: identity.user.id }, async db => {
    const attempts = (await db.query(`SELECT a.id,a.status,a.ordinal,a.created_at,s.step_kind,b.amount::text AS reserved_eur,b.actual::text AS settled_eur,b.state AS reservation,
        h.amount_ucr AS held_ucr,h.captured_ucr,h.state AS hold_state,
        (SELECT x.amount_ucr FROM billing.shadow_entry x WHERE x.org_id=a.org_id AND x.attempt_id=a.id AND x.kind='capture' LIMIT 1) AS shadow_captured_ucr,
        (SELECT x.amount_ucr FROM billing.shadow_entry x WHERE x.org_id=a.org_id AND x.attempt_id=a.id AND x.kind='hold' LIMIT 1) AS shadow_held_ucr
      FROM evals.execution_attempt a
      JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
      JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
      LEFT JOIN evals.budget_reservation b ON (b.org_id,b.attempt_id)=(a.org_id,a.id)
      LEFT JOIN billing.credit_hold h ON h.org_id=a.org_id AND h.hold_key='attempt:'||a.id
      WHERE w.org_id=$1 AND w.run_id=$2 ORDER BY a.created_at,a.id LIMIT 500`, [orgId, id])).rows;
    const meters = (await db.query(`SELECT meter, count(*)::int AS n, coalesce(-sum(amount_ucr),0)::text AS ucr FROM billing.ledger_entry
      WHERE org_id=$1 AND run_id=$2 AND entry_type='action' GROUP BY meter ORDER BY meter`, [orgId, id])).rows;
    const shadowMeters = (await db.query(`SELECT meter, count(*)::int AS n, coalesce(sum(amount_ucr),0)::text AS ucr FROM billing.shadow_entry
      WHERE org_id=$1 AND run_id=$2 AND kind='action' GROUP BY meter ORDER BY meter`, [orgId, id])).rows;
    const refunds = (await db.query(`SELECT coalesce(sum(amount_ucr),0)::text AS ucr FROM billing.ledger_entry WHERE org_id=$1 AND run_id=$2 AND entry_type='refund' AND amount_ucr>0`, [orgId, id])).rows[0];
    const revision = (await db.query("SELECT price_book_revision_id FROM evals.run WHERE org_id=$1 AND id=$2", [orgId, id])).rows[0];
    const rows = attempts.map(row => {
      const shadow = row.captured_ucr === null || row.captured_ucr === undefined;
      const charged = shadow ? big(row.shadow_captured_ucr) : big(row.captured_ucr);
      return {
        attemptId: String(row.id), role: String(row.step_kind), status: String(row.status), ordinal: Number(row.ordinal), createdAt: iso(row.created_at),
        reservedEur: str(row.reserved_eur), settledEur: str(row.settled_eur), reservation: str(row.reservation),
        held: row.held_ucr !== null && row.held_ucr !== undefined ? credits(row.held_ucr) : row.shadow_held_ucr !== null && row.shadow_held_ucr !== undefined ? credits(row.shadow_held_ucr) : null,
        charged: (shadow && (row.shadow_captured_ucr === null || row.shadow_captured_ucr === undefined)) ? null : ucrToCredits(charged),
        holdState: str(row.hold_state), shadow: shadow && row.shadow_captured_ucr !== null && row.shadow_captured_ucr !== undefined,
      };
    });
    const sumUcr = (values: unknown[]) => values.reduce<bigint>((total, value) => total + big(value), BigInt(0));
    const engineUcr = sumUcr(attempts.map(row => row.captured_ucr ?? row.shadow_captured_ucr ?? 0));
    const meterUcr = sumUcr(meters.map(row => row.ucr)) + sumUcr(shadowMeters.map(row => row.ucr));
    const settled = attempts.reduce((total, row) => total + Number(row.settled_eur ?? 0), 0);
    return {
      runId: id, priceBookRevisionId: str(revision?.price_book_revision_id), attempts: rows,
      meters: meters.map(row => ({ meter: String(row.meter), count: Number(row.n), credits: credits(row.ucr), shadow: false }))
        .concat(shadowMeters.map(row => ({ meter: String(row.meter), count: Number(row.n), credits: credits(row.ucr), shadow: true }))),
      totals: { engineCredits: ucrToCredits(engineUcr), meterCredits: ucrToCredits(meterUcr), refundedCredits: credits(refunds.ucr),
        chargedEur: ((Number(engineUcr + meterUcr - big(refunds.ucr)) / 1e6) / 100).toFixed(4), settledEur: settled.toFixed(4) },
    };
  }).catch(opsApiError);
}
