/**
 * Top-up packs, bonuses and purchase limits (launch spec v2 §6.5, §6.6,
 * §6.15). The database (migration 091) derives every amount from the same
 * table when it creates an order; this module mirrors it for previews and
 * is tested against it. 1 credit = €0.01 excl. VAT, so a pack's base credits
 * equal its net price in cents.
 */
import { UCR_PER_CREDIT } from "./units";

export interface Pack {
  /** Stable id: the net price in euros, e.g. "eur_50". */
  id: string;
  netCents: number;
  /** Pack bonus in percent of the base credits (0–10 %). */
  bonusPercent: number;
}

export const PACKS: readonly Pack[] = Object.freeze([
  { id: "eur_20", netCents: 2000, bonusPercent: 0 },
  { id: "eur_50", netCents: 5000, bonusPercent: 3 },
  { id: "eur_100", netCents: 10000, bonusPercent: 5 },
  { id: "eur_250", netCents: 25000, bonusPercent: 8 },
  { id: "eur_500", netCents: 50000, bonusPercent: 10 },
]);

/** +20 % on the first top-up, once per workspace, company domain and tax ID (D-08). */
export const FIRST_TOP_UP_BONUS_PERCENT = 20;

/** New accounts (§6.15): until 30 days after the first payment, at most €100 net in flight or kept, and 3 top-ups a day. */
export const NEW_ACCOUNT_DAYS = 30;
export const NEW_ACCOUNT_MAX_NET_CENTS = 10_000;
export const NEW_ACCOUNT_MAX_TOP_UPS_PER_DAY = 3;

/** An untouched purchase can be refunded within 14 days (D-10). */
export const REFUND_WINDOW_DAYS = 14;

/** Auto-recharge defaults (§6.6): below 500 credits, buy the €50 pack, at most 3 recharges or €300 a month. */
export const AUTO_RECHARGE_DEFAULTS = Object.freeze({ thresholdCredits: 500, packCents: 5000, monthlyMaxCount: 3, monthlyMaxCents: 30_000 });

export function findPack(idOrCents: string | number): Pack | null {
  return PACKS.find(pack => pack.id === idOrCents || pack.netCents === idOrCents) ?? null;
}

export interface PackCredits {
  baseUcr: bigint;
  packBonusUcr: bigint;
  /** The first top-up bonus offered (0 when not eligible). */
  firstBonusUcr: bigint;
  /** The bonus that applies: the larger of the two, never both. */
  bonusUcr: bigint;
  bonusKind: "pack" | "first_top_up" | null;
  totalUcr: bigint;
}

/** Credits for a pack. The bonuses don't stack: the larger applies, so tokens are never sold below cost. */
export function packCredits(pack: Pack, firstTopUp: boolean): PackCredits {
  const baseUcr = BigInt(pack.netCents) * UCR_PER_CREDIT;
  const packBonusUcr = (baseUcr * BigInt(pack.bonusPercent)) / BigInt(100);
  const firstBonusUcr = firstTopUp ? (baseUcr * BigInt(FIRST_TOP_UP_BONUS_PERCENT)) / BigInt(100) : BigInt(0);
  const first = firstBonusUcr > packBonusUcr;
  const bonusUcr = first ? firstBonusUcr : packBonusUcr;
  return {
    baseUcr, packBonusUcr, firstBonusUcr, bonusUcr,
    bonusKind: first ? "first_top_up" : packBonusUcr > BigInt(0) ? "pack" : null,
    totalUcr: baseUcr + bonusUcr,
  };
}

export interface LimitState { isNew: boolean; windowNetCents: number; recentCount: number; lifted: boolean }

/** Why a new pack can't be bought now, or null. Mirrors billing._create_order. */
export function purchaseBlock(limits: LimitState, netCents: number): "PURCHASE_LIMIT" | "PURCHASE_RATE_LIMIT" | null {
  if (!limits.isNew || limits.lifted) return null;
  if (limits.windowNetCents + netCents > NEW_ACCOUNT_MAX_NET_CENTS) return "PURCHASE_LIMIT";
  if (limits.recentCount >= NEW_ACCOUNT_MAX_TOP_UPS_PER_DAY) return "PURCHASE_RATE_LIMIT";
  return null;
}
