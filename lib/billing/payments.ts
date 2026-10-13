/**
 * Typed wrappers for the payment functions of migration 091 (launch spec v2
 * §6.6, §6.14–§6.16). Each takes a client inside the caller's transaction,
 * scoped with withTenant to the workspace it acts on. Payment recording
 * (purchases, failures, refunds, disputes) runs as a service identity
 * (system:stripe-webhook, system:stripe-sync, the scheduler) or a platform
 * admin; owner functions run as the signed-in owner.
 */
import type { PoolClient } from "pg";
import type { TaxIdKind, TaxReviewReason, TaxTreatment, ViesStatus } from "./tax";

export const PAYMENT_ERROR_CODES = [
  "BILLING_PROFILE_REQUIRED", "TAX_REVIEW_REQUIRED", "PURCHASE_LIMIT", "PURCHASE_RATE_LIMIT", "ORDER_NOT_FOUND", "ORDER_NOT_PAID",
  "PAYMENT_MISMATCH", "REFUND_NOT_ALLOWED", "ACCOUNT_FROZEN", "IDEMPOTENCY_CONFLICT", "SCOPE_DENIED", "INPUT_INVALID",
  "REASON_REQUIRED", "ACCOUNT_MISSING", "ENTRY_ALREADY_REVERSED", "REVERSAL_EXCEEDS_REMAINING",
] as const;
export type PaymentErrorCode = typeof PAYMENT_ERROR_CODES[number];

export class PaymentError extends Error {
  constructor(readonly code: PaymentErrorCode) { super(code); this.name = "PaymentError"; }
}
const codes = new Set<string>(PAYMENT_ERROR_CODES);
function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (codes.has(message)) throw new PaymentError(message as PaymentErrorCode);
  throw error;
}
async function call<T>(db: PoolClient, sql: string, params: unknown[], map: (row: Row) => T): Promise<T> {
  try {
    const row = (await db.query(sql, params)).rows[0];
    return map(row);
  } catch (error) { rethrow(error); }
}

type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value);
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const date = (value: unknown) => (value ? new Date(value as string) : null);

export type OrderStatus = "pending" | "paid" | "failed" | "canceled" | "expired" | "refund_pending" | "refunded" | "disputed" | "charged_back";
export type OrderKind = "checkout" | "auto_recharge";

export interface TopUpOrder {
  id: string; orgId: string; kind: OrderKind; livemode: boolean; status: OrderStatus;
  netCents: number; vatRateBp: number; vatCents: number; grossCents: number; taxTreatment: TaxTreatment;
  taxSnapshot: Record<string, unknown>;
  baseUcr: bigint; packBonusUcr: bigint; firstBonusUcr: bigint; bonusUcr: bigint | null; bonusKind: "pack" | "first_top_up" | null;
  firstPaid: boolean | null; buyerDomain: string | null; idempotencyKey: string; createdBy: string;
  checkoutSessionId: string | null; checkoutExpiresAt: Date | null; paymentIntentId: string | null; chargeId: string | null;
  customerId: string | null; refundId: string | null; disputeId: string | null; cardCountry: string | null; riskFlags: string[];
  failureCode: string | null; failureCount: number; purchaseEntryId: string | null; bonusEntryId: string | null;
  attribution: Record<string, unknown>; autoRechargeCrossing: number | null; autoRechargeAttempt: number | null;
  paidAt: Date | null; failedAt: Date | null; refundedAt: Date | null; createdAt: Date;
}

export function order(row: Row): TopUpOrder {
  return {
    id: String(row.id), orgId: String(row.org_id), kind: row.kind as OrderKind, livemode: Boolean(row.livemode), status: row.status as OrderStatus,
    netCents: num(row.net_cents), vatRateBp: num(row.vat_rate_bp), vatCents: num(row.vat_cents), grossCents: num(row.gross_cents),
    taxTreatment: row.tax_treatment as TaxTreatment, taxSnapshot: (row.tax_snapshot ?? {}) as Record<string, unknown>,
    baseUcr: BigInt(row.base_ucr as string), packBonusUcr: BigInt(row.pack_bonus_ucr as string), firstBonusUcr: BigInt(row.first_bonus_ucr as string),
    bonusUcr: row.bonus_ucr === null || row.bonus_ucr === undefined ? null : BigInt(row.bonus_ucr as string),
    bonusKind: (row.bonus_kind ?? null) as TopUpOrder["bonusKind"], firstPaid: row.first_paid === null || row.first_paid === undefined ? null : Boolean(row.first_paid),
    buyerDomain: str(row.buyer_domain), idempotencyKey: String(row.idempotency_key), createdBy: String(row.created_by),
    checkoutSessionId: str(row.stripe_checkout_session_id), checkoutExpiresAt: date(row.checkout_expires_at),
    paymentIntentId: str(row.stripe_payment_intent_id), chargeId: str(row.stripe_charge_id), customerId: str(row.stripe_customer_id),
    refundId: str(row.stripe_refund_id), disputeId: str(row.stripe_dispute_id), cardCountry: str(row.card_country),
    riskFlags: (row.risk_flags ?? []) as string[], failureCode: str(row.failure_code), failureCount: num(row.failure_count ?? 0),
    purchaseEntryId: str(row.purchase_entry_id), bonusEntryId: str(row.bonus_entry_id),
    attribution: (row.attribution ?? {}) as Record<string, unknown>,
    autoRechargeCrossing: row.auto_recharge_crossing === null || row.auto_recharge_crossing === undefined ? null : num(row.auto_recharge_crossing),
    autoRechargeAttempt: row.auto_recharge_attempt === null || row.auto_recharge_attempt === undefined ? null : num(row.auto_recharge_attempt),
    paidAt: date(row.paid_at), failedAt: date(row.failed_at), refundedAt: date(row.refunded_at), createdAt: new Date(row.created_at as string),
  };
}

export interface BillingProfile {
  orgId: string; legalName: string; country: string; taxId: string; taxIdKind: TaxIdKind; viesStatus: ViesStatus;
  viesCheckedAt: Date | null; viesConsultation: string | null; taxTreatment: TaxTreatment | null; taxReviewReason: TaxReviewReason | null;
  addressLine1: string; addressLine2: string | null; postalCode: string; city: string; region: string | null; billingEmail: string;
  limitsLiftedAt: Date | null; version: number; updatedAt: Date;
}
export function profile(row: Row): BillingProfile {
  return {
    orgId: String(row.org_id), legalName: String(row.legal_name), country: String(row.country), taxId: String(row.tax_id),
    taxIdKind: row.tax_id_kind as TaxIdKind, viesStatus: row.vies_status as ViesStatus, viesCheckedAt: date(row.vies_checked_at),
    viesConsultation: str(row.vies_consultation), taxTreatment: (row.tax_treatment ?? null) as TaxTreatment | null,
    taxReviewReason: (row.tax_review_reason ?? null) as TaxReviewReason | null, addressLine1: String(row.address_line1),
    addressLine2: str(row.address_line2), postalCode: String(row.postal_code), city: String(row.city), region: str(row.region),
    billingEmail: String(row.billing_email), limitsLiftedAt: date(row.limits_lifted_at), version: num(row.version),
    updatedAt: new Date(row.updated_at as string),
  };
}

export interface AutoRecharge {
  orgId: string; enabled: boolean; thresholdUcr: bigint; packCents: number; monthlyMaxCount: number; monthlyMaxCents: number;
  armed: boolean; crossingSeq: number; inFlightOrderId: string | null; failures: number; retryAfter: Date | null;
  lastFailureCode: string | null; lastSuccessAt: Date | null; disabledReason: "payment_failed" | "owner" | null;
}
export function autoRecharge(row: Row): AutoRecharge {
  return {
    orgId: String(row.org_id), enabled: Boolean(row.enabled), thresholdUcr: BigInt(row.threshold_ucr as string), packCents: num(row.pack_cents),
    monthlyMaxCount: num(row.monthly_max_count), monthlyMaxCents: num(row.monthly_max_cents), armed: Boolean(row.armed),
    crossingSeq: num(row.crossing_seq), inFlightOrderId: str(row.in_flight_order_id), failures: num(row.failures),
    retryAfter: date(row.retry_after), lastFailureCode: str(row.last_failure_code), lastSuccessAt: date(row.last_success_at),
    disabledReason: (row.disabled_reason ?? null) as AutoRecharge["disabledReason"],
  };
}

export interface StripeCustomerRow { customerId: string; paymentMethodId: string | null; cardBrand: string | null; cardLast4: string | null; cardCountry: string | null }

/* --------------------------------------------------------------- reads --- */

export async function getProfile(db: PoolClient, orgId: string): Promise<BillingProfile | null> {
  const row = (await db.query("SELECT * FROM billing.billing_profile WHERE org_id=$1", [orgId])).rows[0];
  return row ? profile(row) : null;
}
export async function getOrder(db: PoolClient, orgId: string, orderId: string): Promise<TopUpOrder | null> {
  const row = (await db.query("SELECT * FROM billing.top_up_order WHERE org_id=$1 AND id=$2", [orgId, orderId])).rows[0];
  return row ? order(row) : null;
}
export async function getStripeCustomer(db: PoolClient, orgId: string, livemode: boolean): Promise<StripeCustomerRow | null> {
  const row = (await db.query("SELECT * FROM billing.stripe_customer WHERE org_id=$1 AND livemode=$2", [orgId, livemode])).rows[0];
  return row ? { customerId: row.customer_id, paymentMethodId: row.payment_method_id, cardBrand: row.card_brand, cardLast4: row.card_last4, cardCountry: row.card_country } : null;
}
export async function getAutoRecharge(db: PoolClient, orgId: string): Promise<AutoRecharge | null> {
  const row = (await db.query("SELECT * FROM billing.auto_recharge WHERE org_id=$1", [orgId])).rows[0];
  return row ? autoRecharge(row) : null;
}
export async function firstBonusAvailable(db: PoolClient, orgId: string, buyerDomain: string | null): Promise<boolean> {
  return call(db, "SELECT billing.first_bonus_available($1,$2) AS open", [orgId, buyerDomain], row => Boolean(row.open));
}
export async function purchaseLimits(db: PoolClient, orgId: string) {
  return call(db, "SELECT * FROM billing.purchase_limits($1)", [orgId], row => ({
    isNew: Boolean(row.is_new), windowNetCents: num(row.window_net_cents), recentCount: num(row.recent_count), lifted: Boolean(row.lifted),
  }));
}

/* -------------------------------------------------------------- owners --- */

export interface ProfileInput {
  legalName: string; country: string; taxId: string; taxIdKind: TaxIdKind; viesStatus: ViesStatus; viesConsultation: string | null;
  taxTreatment: TaxTreatment | null; taxReviewReason: TaxReviewReason | null; addressLine1: string; addressLine2: string | null;
  postalCode: string; city: string; region: string | null; billingEmail: string;
}
export function saveProfile(db: PoolClient, orgId: string, input: ProfileInput, requestId?: string) {
  return call(db, "SELECT * FROM billing.save_profile($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)", [
    orgId, input.legalName, input.country, input.taxId, input.taxIdKind, input.viesStatus, input.viesConsultation, input.taxTreatment,
    input.taxReviewReason, input.addressLine1, input.addressLine2, input.postalCode, input.city, input.region, input.billingEmail, requestId ?? null,
  ], profile);
}
export function saveStripeCustomer(db: PoolClient, orgId: string, livemode: boolean, customerId: string) {
  return call(db, "SELECT * FROM billing.save_stripe_customer($1,$2,$3)", [orgId, livemode, customerId], row => String(row.customer_id));
}
export function createTopUpOrder(db: PoolClient, input: { orgId: string; key: string; netCents: number; livemode: boolean; buyerDomain: string | null; requestId?: string }) {
  return call(db, "SELECT * FROM billing.create_top_up_order($1,$2,$3,$4,$5,$6)",
    [input.orgId, input.key, input.netCents, input.livemode, input.buyerDomain, input.requestId ?? null], order);
}
export function attachCheckoutSession(db: PoolClient, orgId: string, orderId: string, sessionId: string, expiresAt: Date) {
  return call(db, "SELECT * FROM billing.attach_checkout_session($1,$2,$3,$4)", [orgId, orderId, sessionId, expiresAt], order);
}
export function closeCheckout(db: PoolClient, orgId: string, orderId: string, status: "canceled" | "expired") {
  return call(db, "SELECT * FROM billing.close_checkout($1,$2,$3)", [orgId, orderId, status], order);
}
export interface AutoRechargeInput { enabled: boolean; thresholdUcr: bigint; packCents: number; monthlyMaxCount: number; monthlyMaxCents: number }
export function setAutoRecharge(db: PoolClient, orgId: string, input: AutoRechargeInput, requestId?: string) {
  return call(db, "SELECT * FROM billing.set_auto_recharge($1,$2,$3,$4,$5,$6,$7)",
    [orgId, input.enabled, input.thresholdUcr.toString(), input.packCents, input.monthlyMaxCount, input.monthlyMaxCents, requestId ?? null], autoRecharge);
}

/* ------------------------------------------------- payment recording --- */

export function stripeEventBegin(db: PoolClient, event: { id: string; type: string; livemode: boolean; apiVersion: string | null; objectId: string | null; payloadSha256: string; created: Date }) {
  return call(db, "SELECT * FROM billing.stripe_event_begin($1,$2,$3,$4,$5,$6,$7)",
    [event.id, event.type, event.livemode, event.apiVersion, event.objectId, event.payloadSha256, event.created],
    row => ({ status: String(row.status) as "received" | "processed" | "ignored" | "failed", deliveries: num(row.deliveries) }));
}
export function stripeEventFinish(db: PoolClient, id: string, status: "processed" | "ignored" | "failed", outcome: string, orgId?: string | null, orderId?: string | null) {
  return call(db, "SELECT * FROM billing.stripe_event_finish($1,$2,$3,$4,$5)", [id, status, outcome, orgId ?? null, orderId ?? null], row => String(row.status));
}
export async function findTopUpOrder(db: PoolClient, ids: { orderId?: string | null; sessionId?: string | null; paymentIntentId?: string | null; chargeId?: string | null }) {
  const uuid = ids.orderId && /^[0-9a-f-]{36}$/i.test(ids.orderId) ? ids.orderId : null;
  try {
    const row = (await db.query("SELECT * FROM billing.find_top_up_order($1::uuid,$2,$3,$4)",
      [uuid, ids.sessionId ?? null, ids.paymentIntentId ?? null, ids.chargeId ?? null])).rows[0];
    return row ? { orgId: String(row.org_id), orderId: String(row.order_id), status: row.status as OrderStatus, livemode: Boolean(row.livemode) } : null;
  } catch (error) { rethrow(error); }
}
export function recordPurchase(db: PoolClient, input: {
  orgId: string; orderId: string; livemode: boolean; amountCents: number; currency: string; paymentIntentId: string;
  sessionId?: string | null; customerId?: string | null; eventId?: string | null;
}) {
  return call(db, "SELECT * FROM billing.record_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)", [input.orgId, input.orderId, input.livemode,
    input.amountCents, input.currency, input.paymentIntentId, input.sessionId ?? null, input.customerId ?? null, input.eventId ?? null], order);
}
export function recordPaymentDetails(db: PoolClient, input: {
  orgId: string; orderId: string; chargeId: string | null; paymentMethodId: string | null; cardBrand: string | null; cardLast4: string | null;
  cardCountry: string | null; saveCard: boolean; checkoutCountry?: string | null; checkoutTaxIds?: string[] | null;
}) {
  return call(db, "SELECT * FROM billing.record_payment_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [input.orgId, input.orderId, input.chargeId,
    input.paymentMethodId, input.cardBrand, input.cardLast4, input.cardCountry, input.saveCard, input.checkoutCountry ?? null,
    input.checkoutTaxIds ?? null], order);
}
export function recordPaymentFailure(db: PoolClient, input: { orgId: string; orderId: string; paymentIntentId: string | null; code: string; eventId?: string | null }) {
  return call(db, "SELECT * FROM billing.record_payment_failure($1,$2,$3,$4,$5)",
    [input.orgId, input.orderId, input.paymentIntentId, input.code, input.eventId ?? null], order);
}
export function beginTopUpRefund(db: PoolClient, input: { orgId: string; orderId: string; reason: string; requestId?: string }) {
  return call(db, "SELECT * FROM billing.begin_top_up_refund($1,$2,$3,$4)", [input.orgId, input.orderId, input.reason, input.requestId ?? null], order);
}
export function finishTopUpRefund(db: PoolClient, orgId: string, orderId: string, refundId: string) {
  return call(db, "SELECT * FROM billing.finish_top_up_refund($1,$2,$3)", [orgId, orderId, refundId], order);
}
export function recordChargeRefunded(db: PoolClient, input: { orgId: string; orderId: string; refundId: string | null; amountRefundedCents: number; eventId?: string | null }) {
  return call(db, "SELECT * FROM billing.record_charge_refunded($1,$2,$3,$4,$5)",
    [input.orgId, input.orderId, input.refundId, input.amountRefundedCents, input.eventId ?? null], order);
}
export function recordDispute(db: PoolClient, input: { orgId: string; orderId: string; disputeId: string; status: string; eventId?: string | null }) {
  return call(db, "SELECT * FROM billing.record_dispute($1,$2,$3,$4,$5)", [input.orgId, input.orderId, input.disputeId, input.status, input.eventId ?? null], order);
}
export async function autoRechargeDue(db: PoolClient, limit = 100): Promise<string[]> {
  try { return (await db.query("SELECT billing.auto_recharge_due($1) AS org_id", [limit])).rows.map(row => String(row.org_id)); } catch (error) { rethrow(error); }
}
export async function claimAutoRecharge(db: PoolClient, orgId: string, livemode: boolean): Promise<TopUpOrder | null> {
  try {
    const row = (await db.query("SELECT * FROM billing.claim_auto_recharge($1,$2)", [orgId, livemode])).rows[0];
    return row ? order(row) : null;
  } catch (error) { rethrow(error); }
}
export function attachPaymentIntent(db: PoolClient, orgId: string, orderId: string, paymentIntentId: string, customerId: string) {
  return call(db, "SELECT * FROM billing.attach_payment_intent($1,$2,$3,$4)", [orgId, orderId, paymentIntentId, customerId], order);
}
export function claimAlert(db: PoolClient, orgId: string, kind: string, periodKey: string, payload: Record<string, unknown> = {}) {
  return call(db, "SELECT billing.claim_alert($1,$2,$3,$4::jsonb) AS claimed", [orgId, kind, periodKey, JSON.stringify(payload)], row => Boolean(row.claimed));
}
export async function markAlertSent(db: PoolClient, orgId: string, kind: string, periodKey: string) {
  try { await db.query("SELECT billing.mark_alert_sent($1,$2,$3)", [orgId, kind, periodKey]); } catch (error) { rethrow(error); }
}
