/**
 * Billing flags and credit-expiry defaults (launch spec v2 §6.10, §6.18).
 * Flags are read on the server at runtime, in the web process and in every
 * worker; never through NEXT_PUBLIC_* variables.
 */

type Env = Record<string, string | undefined>;

export type BillingEnforceMode = "shadow" | "enforce";
export interface BillingFlags { creditsEnabled: boolean; enforce: BillingEnforceMode }

/** BILLING_CREDITS_ENABLED: the credit layer is off unless exactly "true". */
export function billingCreditsEnabled(env: Env = process.env): boolean {
  return env.BILLING_CREDITS_ENABLED === "true";
}

/**
 * BILLING_ENFORCE: "enforce" blocks work that credits do not cover; anything
 * else is "shadow" (computed and compared, never blocking). Turning
 * enforcement off is the kill switch back to entitlement and euro-budget checks.
 */
export function billingEnforceMode(env: Env = process.env): BillingEnforceMode {
  return env.BILLING_ENFORCE === "enforce" ? "enforce" : "shadow";
}

export function billingFlags(env: Env = process.env): BillingFlags {
  return { creditsEnabled: billingCreditsEnabled(env), enforce: billingEnforceMode(env) };
}

/** Lot sources, as stored in billing.credit_lot.source. */
export type CreditSource = "purchase" | "bonus" | "grant" | "promo" | "allowance" | "contract_allowance" | "adjustment";

/**
 * How long each kind of credit lasts (D-10): purchased credits and their bonus
 * 24 months, promo credits 30 days, the monthly allowance until month end
 * (UTC, like the monthly run limit). Ops grants default to the promo period,
 * positive adjustments to the purchased period. Contract allowances end with
 * the contract period, which the caller must give. Periods run to the end of
 * their last UTC day, so a retried request computes the same expiry and
 * replays instead of raising IDEMPOTENCY_CONFLICT.
 */
export type ExpiryRule = { months: number } | { days: number } | "month_end" | "caller";
export const CREDIT_EXPIRY_DEFAULTS: Readonly<Record<CreditSource, ExpiryRule>> = Object.freeze({
  purchase: { months: 24 },
  bonus: { months: 24 },
  promo: { days: 30 },
  grant: { days: 30 },
  allowance: "month_end",
  contract_allowance: "caller",
  adjustment: { months: 24 },
});

/** First instant after the month that contains `from` (UTC). */
export function monthEnd(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

/** Adds calendar months in UTC, clamping to the last day of a shorter month. */
export function addMonths(from: Date, months: number): Date {
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  target.setUTCHours(from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds());
  return target;
}

/** First instant of the UTC day after `at`: "valid until the end of that day". */
export function endOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}

export function defaultExpiry(source: CreditSource, from = new Date(), rules: Readonly<Record<CreditSource, ExpiryRule>> = CREDIT_EXPIRY_DEFAULTS): Date {
  const rule = rules[source];
  if (rule === "caller") throw new Error("expiry_required");
  if (rule === "month_end") return monthEnd(from);
  if ("months" in rule) return endOfUtcDay(addMonths(from, rule.months));
  return endOfUtcDay(new Date(from.getTime() + rule.days * 86_400_000));
}
