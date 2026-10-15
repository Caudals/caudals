/**
 * Spend caps and auto-recharge coverage (launch L-15, spec v2 §6.6, §6.7,
 * §6.10). Caps are stored by L-12 (billing.spend_cap, written only through
 * billing.set_spend_cap, which accepts the workspace's owners, platform
 * admins and services and audits every change):
 *
 *   workspace_monthly  a credit cap on this UTC month's usage plus open holds;
 *                      none by default (optional on pay as you go).
 *   per_run            a fixed credit cap, or a multiple of the run's p90
 *                      estimate; 2 × p90 by default.
 *
 * Enforcement applies only where credits are enforced (BILLING_ENFORCE or the
 * workspace's override) and never to contract workspaces:
 *   - admission (run start, schedule dispatch, resume): a run whose p90 would
 *     pass the monthly cap, or whose fixed per-run cap is below its p90 (or,
 *     at resume, its spend so far plus the p90 of what is left), is refused
 *     with CAP_REACHED;
 *   - the scheduler's cap watch (lib/billing/cap-watch.ts) pauses runs with
 *     `cap_reached` once a cap is reached. It runs as the web runtime role:
 *     worker roles cannot read billing.spend_cap.
 *
 * "Auto-recharge covers the gap" (§6.7): auto-recharge is on with a saved card,
 * not failing, within its monthly limits, and one recharge pack plus the
 * available credits reaches what the run needs.
 *
 * No React and no "server-only" (the scheduler imports it).
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "../evals/domain/errors";
import { monthWindow, runSpendUcr, usageTotals } from "./account-view";
import { findPack, packCredits } from "./packs";
import { paymentsAccess, stripeMode } from "./payments-config";
import { UCR_PER_CREDIT, wholeCreditsUp } from "./units";

type Env = Record<string, string | undefined>;
const ZERO = BigInt(0);
const big = (value: unknown) => (value === null || value === undefined ? null : BigInt(String(value)));

/** §6.10: a run pauses at twice its p90 estimate unless the owner sets otherwise. */
export const DEFAULT_RUN_CAP_MULTIPLIER = 2;

export interface SpendCaps {
  /** This month's usage plus open holds may not pass this (µcr); null = no cap. */
  monthlyUcr: bigint | null;
  /** A fixed cap per run (µcr), or null to use the multiplier. */
  perRunUcr: bigint | null;
  /** Multiple of the run's p90 estimate (when no fixed cap). */
  perRunMultiplier: number;
  updatedAt: Date | null;
}

export async function readSpendCaps(db: PoolClient, orgId: string): Promise<SpendCaps> {
  const rows = (await db.query("SELECT scope,cap_ucr,p90_multiplier,updated_at FROM billing.spend_cap WHERE org_id=$1 AND scope IN ('workspace_monthly','per_run')", [orgId])).rows;
  const monthly = rows.find(row => row.scope === "workspace_monthly");
  const perRun = rows.find(row => row.scope === "per_run");
  const updated = rows.map(row => new Date(row.updated_at).getTime()).sort((a, b) => b - a)[0];
  return {
    monthlyUcr: big(monthly?.cap_ucr),
    perRunUcr: big(perRun?.cap_ucr),
    perRunMultiplier: perRun?.p90_multiplier ? Number(perRun.p90_multiplier) : DEFAULT_RUN_CAP_MULTIPLIER,
    updatedAt: updated ? new Date(updated) : null,
  };
}

export const capsInput = z.strictObject({
  orgId: z.uuid(),
  /** Credits; null removes the monthly cap. */
  monthlyCapCredits: z.number().int().min(100).max(10_000_000).nullable(),
  perRun: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("multiplier"), multiplier: z.number().min(1).max(10).multipleOf(0.5) }),
    z.strictObject({ mode: z.literal("fixed"), credits: z.number().int().min(10).max(1_000_000) }),
  ]),
  /**
   * The low-balance alert threshold in credits (§6.10, §6.12; migration 112);
   * null returns to the default (500 credits, or 20 % of the last pack).
   * Omitted: unchanged.
   */
  lowBalanceThresholdCredits: z.number().int().min(1).max(10_000_000).nullable().optional(),
});
export type CapsInput = z.infer<typeof capsInput>;

/** Saves both caps through billing.set_spend_cap (owner check and audit in the database), in the caller's transaction. */
export async function saveSpendCaps(db: PoolClient, input: CapsInput, requestId: string): Promise<SpendCaps> {
  const credits = (value: number) => (BigInt(value) * UCR_PER_CREDIT).toString();
  try {
    await db.query("SELECT billing.set_spend_cap($1,'workspace_monthly',NULL,$2,NULL,$3)",
      [input.orgId, input.monthlyCapCredits === null ? null : credits(input.monthlyCapCredits), requestId]);
    await db.query("SELECT billing.set_spend_cap($1,'per_run',NULL,$2,$3,$4)", [input.orgId,
      input.perRun.mode === "fixed" ? credits(input.perRun.credits) : null,
      input.perRun.mode === "multiplier" ? input.perRun.multiplier : null, requestId]);
  } catch (error) {
    if (error instanceof Error && error.message === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
    throw error;
  }
  return readSpendCaps(db, input.orgId);
}

/** Saves the low-balance threshold through billing.set_low_balance_threshold (owner check and audit in the database). */
export async function saveLowBalanceThreshold(db: PoolClient, orgId: string, credits: number | null, requestId: string): Promise<void> {
  try {
    await db.query("SELECT billing.set_low_balance_threshold($1,$2,$3)", [orgId, credits === null ? null : (BigInt(credits) * UCR_PER_CREDIT).toString(), requestId]);
  } catch (error) {
    if (error instanceof Error && error.message === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
    throw error;
  }
}

/** The cap for one run: the fixed cap, else the multiplier × its p90 estimate. */
export function runCapUcr(caps: SpendCaps, p90Ucr: bigint): bigint {
  if (caps.perRunUcr !== null) return caps.perRunUcr;
  // Multipliers are halves (1, 1.5, 2…): exact in integers.
  return (p90Ucr * BigInt(Math.round(caps.perRunMultiplier * 2))) / BigInt(2);
}

/** This month's usage plus what is held now: what the monthly cap counts. */
export async function monthCommittedUcr(db: PoolClient, orgId: string, heldUcr: bigint, at: Date = new Date()): Promise<bigint> {
  const window = monthWindow(at);
  return (await usageTotals(db, orgId, window.start, window.end)).netUcr + heldUcr;
}

export function capReachedError(message: string) {
  return new EvalError("CAP_REACHED", 409, message);
}

/**
 * Admission against the caps (enforce mode, credit workspaces; the caller
 * checks both). `requiredUcr` is the p90 of the run (at resume: of the units
 * left); `runId` is set at resume, when the run's own spend counts too.
 */
export async function assertWithinCaps(db: PoolClient, orgId: string, input: { requiredUcr: bigint; p90Ucr: bigint; heldUcr: bigint; runId?: string | null }) {
  const caps = await readSpendCaps(db, orgId);
  if (caps.monthlyUcr !== null) {
    const committed = await monthCommittedUcr(db, orgId, input.heldUcr);
    if (committed + input.requiredUcr > caps.monthlyUcr) {
      throw capReachedError(`This run would pass the workspace's monthly credit limit (${wholeCreditsUp(committed)} of ${wholeCreditsUp(caps.monthlyUcr)} credits used this month). An owner can raise it in Settings → Billing and usage.`);
    }
  }
  const cap = runCapUcr(caps, input.p90Ucr);
  const spent = input.runId ? await runSpendUcr(db, orgId, input.runId) : ZERO;
  // A fixed cap below the estimate refuses at start; the default multiple never does (it is ≥ 1 × p90).
  if (spent + input.requiredUcr > cap && (caps.perRunUcr !== null || input.runId)) {
    throw capReachedError(`This run would pass the per-run credit limit of ${wholeCreditsUp(cap)} credits. An owner can raise it in Settings → Billing and usage.`);
  }
}

/* -------------------------------------------------- auto-recharge cover --- */

export interface AutoRechargeCover { enabled: boolean; covers: boolean; packCredits: number | null }

/**
 * Whether auto-recharge would cover a shortfall (§6.7 gate): on, with a saved
 * card for the current Stripe mode, not failing or switched off, within its
 * monthly count and euro limits, payments open for the workspace, and one
 * pack covering the gap.
 */
export async function autoRechargeCover(db: PoolClient, orgId: string, shortfallUcr: bigint, env: Env = process.env): Promise<AutoRechargeCover> {
  const settings = (await db.query("SELECT enabled,pack_cents,monthly_max_count,monthly_max_cents,failures,disabled_reason FROM billing.auto_recharge WHERE org_id=$1", [orgId])).rows[0];
  if (!settings?.enabled) return { enabled: false, covers: false, packCredits: null };
  const pack = findPack(Number(settings.pack_cents));
  const packUcr = pack ? packCredits(pack, false).totalUcr : ZERO;
  const result = { enabled: true, covers: false, packCredits: Number(packUcr / UCR_PER_CREDIT) };
  if (shortfallUcr <= ZERO) return { ...result, covers: true };
  if (!pack || settings.disabled_reason || Number(settings.failures) > 0) return result;
  // Auto-recharge was switched on through this same access check; it may have closed since.
  if (paymentsAccess(orgId, env, { requireEntity: false, liveAllowlisted: true }) === "closed") return result;
  const card = (await db.query("SELECT 1 FROM billing.stripe_customer WHERE org_id=$1 AND livemode=$2 AND payment_method_id IS NOT NULL", [orgId, stripeMode(env) === "live"])).rowCount;
  if (!card) return result;
  const month = (await db.query(`SELECT count(*)::int AS count, coalesce(sum(net_cents),0)::bigint AS cents FROM billing.top_up_order
    WHERE org_id=$1 AND kind='auto_recharge' AND status IN ('pending','paid','refund_pending','disputed','charged_back')
      AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`, [orgId])).rows[0];
  if (Number(month.count) >= Number(settings.monthly_max_count) || Number(month.cents) + Number(settings.pack_cents) > Number(settings.monthly_max_cents)) return result;
  return { ...result, covers: packUcr >= shortfallUcr };
}
