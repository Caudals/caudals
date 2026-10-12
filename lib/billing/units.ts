/**
 * Credit arithmetic (launch spec v2 §6.2). 1 credit = €0.01 excl. VAT and the
 * ledger stores micro-credits (µcr, 1 credit = 1,000,000 µcr) as bigint.
 * Everything here is exact integer maths: never floats for money.
 */

export const UCR_PER_CREDIT = BigInt(1_000_000);
/** One operation moves at most 10^9 credits, so lot allocations stay exact in JSON. */
export const MAX_OPERATION_UCR = BigInt("1000000000000000");
const MILLION = BigInt(1_000_000);
const ZERO = BigInt(0);

/** Parses credits ("12", "0.5", 12 or 12n) to µcr. Up to six decimals; never negative. */
export function creditsToUcr(credits: string | number | bigint): bigint {
  if (typeof credits === "bigint") {
    if (credits < ZERO) throw new Error("invalid_credits");
    return credits * UCR_PER_CREDIT;
  }
  const text = typeof credits === "number" ? numberText(credits) : credits.trim();
  const match = /^(0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new Error("invalid_credits");
  return BigInt(match[1]) * UCR_PER_CREDIT + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function numberText(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid_credits");
  // Round-trips any credit amount with up to six decimals without exponent notation.
  const text = value.toFixed(6).replace(/\.?0+$/, "");
  if (Number(text) !== value) throw new Error("invalid_credits");
  return text;
}

/** Exact decimal credits for a µcr amount, without trailing zeros ("-1.5", "270"). */
export function ucrToCredits(ucr: bigint): string {
  const negative = ucr < ZERO;
  const abs = negative ? -ucr : ucr;
  const whole = abs / UCR_PER_CREDIT;
  const fraction = (abs % UCR_PER_CREDIT).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Whole credits as screens show them: a charge rounds up, never down. */
export function wholeCreditsUp(ucr: bigint): bigint {
  if (ucr <= ZERO) return -(-ucr / UCR_PER_CREDIT);
  return (ucr + UCR_PER_CREDIT - BigInt(1)) / UCR_PER_CREDIT;
}

/** Euro equivalent excl. VAT, in cents rounded up (1 credit = 1 cent). */
export function ucrToEuroCentsUp(ucr: bigint): bigint {
  return wholeCreditsUp(ucr);
}

/** "2.70" for 270 credits: the euro equivalent shown beside a credit amount. */
export function formatEuroEquivalent(ucr: bigint): string {
  const cents = ucrToEuroCentsUp(ucr);
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / BigInt(100)}.${(abs % BigInt(100)).toString().padStart(2, "0")}`;
}

function tokens(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_usage");
  return BigInt(value);
}
function rate(value: bigint): bigint {
  if (value < ZERO) throw new Error("invalid_rate");
  return value;
}

/** µcr for a token count at a rate in µcr per 1M tokens, rounded up to the µcr. */
export function tokenChargeUcr(tokenCount: number, ucrPerMillion: bigint): bigint {
  const total = tokens(tokenCount) * rate(ucrPerMillion);
  return (total + MILLION - BigInt(1)) / MILLION;
}

export interface TokenUsage { input: number; output: number; cached?: number }
export interface TokenRates { inputUcrPerMillion: bigint; outputUcrPerMillion: bigint; cachedUcrPerMillion?: bigint }

/**
 * µcr for one call's usage: uncached input, cached input (at the cached rate,
 * or the input rate when none) and output, summed exactly, then rounded up once.
 */
export function usageChargeUcr(usage: TokenUsage, rates: TokenRates): bigint {
  const cached = tokens(usage.cached ?? 0), input = tokens(usage.input), output = tokens(usage.output);
  if (cached > input) throw new Error("invalid_cached_usage");
  const total = (input - cached) * rate(rates.inputUcrPerMillion)
    + cached * rate(rates.cachedUcrPerMillion ?? rates.inputUcrPerMillion)
    + output * rate(rates.outputUcrPerMillion);
  return (total + MILLION - BigInt(1)) / MILLION;
}

/**
 * How billing.capture settles a hold: it charges at most the hold, records any
 * overage as ours, and releases the rest.
 */
export function splitCapture(requestedUcr: bigint, heldUcr: bigint): { captured: bigint; released: bigint; overage: bigint } {
  if (requestedUcr < ZERO || heldUcr <= ZERO) throw new Error("invalid_capture");
  const captured = requestedUcr < heldUcr ? requestedUcr : heldUcr;
  return { captured, released: heldUcr - captured, overage: requestedUcr - captured };
}

export interface SpendableLot { id: string; remainingUcr: bigint; heldUcr: bigint; expiresAt: Date | null; createdAt: Date }
export interface LotAllocation { lotId: string; ucr: bigint }

/**
 * The ledger's lot order, as a pure model: unexpired lots with unheld credits,
 * soonest expiry first (never-expiring last), then oldest, then by id. Used by
 * shadow-mode maths and tests; the database is the authority.
 */
export function allocateOldestExpiringFirst(lots: SpendableLot[], amountUcr: bigint, now = new Date()): { allocations: LotAllocation[]; shortfallUcr: bigint } {
  if (amountUcr < ZERO) throw new Error("invalid_amount");
  const order = lots
    .filter(lot => lot.remainingUcr > lot.heldUcr && (lot.expiresAt === null || lot.expiresAt.getTime() > now.getTime()))
    .sort((a, b) => {
      const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY, eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea < eb ? -1 : 1;
      if (a.createdAt.getTime() !== b.createdAt.getTime()) return a.createdAt.getTime() - b.createdAt.getTime();
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const allocations: LotAllocation[] = [];
  let need = amountUcr;
  for (const lot of order) {
    if (need === ZERO) break;
    const free = lot.remainingUcr - lot.heldUcr;
    const take = need < free ? need : free;
    allocations.push({ lotId: lot.id, ucr: take });
    need -= take;
  }
  return { allocations, shortfallUcr: need };
}
