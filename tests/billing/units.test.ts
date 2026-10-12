import { describe, expect, it } from "vitest";
import {
  allocateOldestExpiringFirst, creditsToUcr, formatEuroEquivalent, splitCapture, tokenChargeUcr, ucrToCredits,
  usageChargeUcr, wholeCreditsUp, UCR_PER_CREDIT,
} from "../../lib/billing/units";
import { CREDIT_EXPIRY_DEFAULTS, addMonths, billingCreditsEnabled, billingEnforceMode, defaultExpiry, monthEnd } from "../../lib/billing/config";
import { billingExpiryDue, billingVerificationDue } from "../../lib/billing/jobs";

const B = (value: number | string) => BigInt(value);

describe("micro-credit maths", () => {
  it("parses credits exactly to µcr and back", () => {
    expect(UCR_PER_CREDIT).toBe(B(1_000_000));
    expect(creditsToUcr("1")).toBe(B(1_000_000));
    expect(creditsToUcr("0.5")).toBe(B(500_000));
    expect(creditsToUcr(270)).toBe(B(270_000_000));
    expect(creditsToUcr(0.1)).toBe(B(100_000));
    expect(creditsToUcr(B(3))).toBe(B(3_000_000));
    expect(creditsToUcr("0.000001")).toBe(B(1));
    for (const bad of ["1.0000001", "-1", "1e3", "", " ", "01", "abc"]) expect(() => creditsToUcr(bad)).toThrow("invalid_credits");
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.0000001]) expect(() => creditsToUcr(bad)).toThrow("invalid_credits");
    expect(ucrToCredits(B(1_500_000))).toBe("1.5");
    expect(ucrToCredits(B(270_000_000))).toBe("270");
    expect(ucrToCredits(B(-1))).toBe("-0.000001");
    expect(ucrToCredits(B(0))).toBe("0");
  });

  it("rounds displayed credits and the euro equivalent up, never down", () => {
    expect(wholeCreditsUp(B(0))).toBe(B(0));
    expect(wholeCreditsUp(B(1))).toBe(B(1));
    expect(wholeCreditsUp(B(1_000_000))).toBe(B(1));
    expect(wholeCreditsUp(B(1_000_001))).toBe(B(2));
    expect(wholeCreditsUp(B(-1_500_000))).toBe(B(-1));
    expect(formatEuroEquivalent(creditsToUcr(270))).toBe("2.70");
    expect(formatEuroEquivalent(creditsToUcr(340) + B(1))).toBe("3.41");
    expect(formatEuroEquivalent(creditsToUcr(1820))).toBe("18.20");
  });

  it("prices token usage per million tokens with one upward rounding", () => {
    // 15 credits per 1M tokens is 15 µcr per token.
    expect(tokenChargeUcr(1, creditsToUcr(15))).toBe(B(15));
    expect(tokenChargeUcr(100_000, creditsToUcr(15))).toBe(creditsToUcr("1.5"));
    expect(tokenChargeUcr(1, B(1))).toBe(B(1));
    expect(tokenChargeUcr(0, creditsToUcr(15))).toBe(B(0));
    // Spec §6.4: Sonnet 5.5 at 275 · 1,365 credits per 1M, 100 k in + 15 k out ≈ 48 credits.
    const sonnet = { inputUcrPerMillion: creditsToUcr(275), outputUcrPerMillion: creditsToUcr(1365) };
    const run = usageChargeUcr({ input: 100_000, output: 15_000 }, sonnet);
    expect(run).toBe(creditsToUcr("47.975"));
    expect(wholeCreditsUp(run)).toBe(B(48));
    // Cached input at its own rate, or the input rate when there is none.
    expect(usageChargeUcr({ input: 1_000_000, output: 0, cached: 400_000 }, { ...sonnet, cachedUcrPerMillion: creditsToUcr(30) }))
      .toBe(creditsToUcr(165 + 12));
    expect(usageChargeUcr({ input: 10, output: 0, cached: 10 }, sonnet)).toBe(B(2750));
    expect(() => usageChargeUcr({ input: 1, output: 0, cached: 2 }, sonnet)).toThrow("invalid_cached_usage");
    expect(() => tokenChargeUcr(-1, B(1))).toThrow("invalid_usage");
    expect(() => tokenChargeUcr(1.5, B(1))).toThrow("invalid_usage");
    expect(() => tokenChargeUcr(1, B(-1))).toThrow("invalid_rate");
  });

  it("caps a capture at its hold and releases the rest", () => {
    expect(splitCapture(B(500), B(300))).toEqual({ captured: B(300), released: B(0), overage: B(200) });
    expect(splitCapture(B(50), B(200))).toEqual({ captured: B(50), released: B(150), overage: B(0) });
    expect(splitCapture(B(0), B(10))).toEqual({ captured: B(0), released: B(10), overage: B(0) });
    expect(() => splitCapture(B(-1), B(10))).toThrow("invalid_capture");
  });

  it("models lot order: soonest expiry first, never-expiring last, skipping expired and held credit", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const at = (iso: string) => new Date(iso);
    const lots = [
      { id: "a", remainingUcr: B(100), heldUcr: B(0), expiresAt: at("2026-12-01T00:00:00Z"), createdAt: at("2026-10-01T00:00:00Z") },
      { id: "never", remainingUcr: B(100), heldUcr: B(0), expiresAt: null, createdAt: at("2026-09-01T00:00:00Z") },
      { id: "d", remainingUcr: B(100), heldUcr: B(0), expiresAt: at("2026-10-20T00:00:00Z"), createdAt: at("2026-10-05T00:00:00Z") },
      { id: "b", remainingUcr: B(100), heldUcr: B(40), expiresAt: at("2026-10-20T00:00:00Z"), createdAt: at("2026-10-02T00:00:00Z") },
      { id: "expired", remainingUcr: B(100), heldUcr: B(0), expiresAt: at("2026-10-12T12:00:00Z"), createdAt: at("2026-08-01T00:00:00Z") },
      { id: "empty", remainingUcr: B(10), heldUcr: B(10), expiresAt: at("2026-10-13T00:00:00Z"), createdAt: at("2026-08-01T00:00:00Z") },
    ];
    expect(allocateOldestExpiringFirst(lots, B(250), now)).toEqual({
      allocations: [{ lotId: "b", ucr: B(60) }, { lotId: "d", ucr: B(100) }, { lotId: "a", ucr: B(90) }], shortfallUcr: B(0),
    });
    expect(allocateOldestExpiringFirst(lots, B(400), now).shortfallUcr).toBe(B(40));
    expect(allocateOldestExpiringFirst(lots, B(0), now)).toEqual({ allocations: [], shortfallUcr: B(0) });
  });
});

describe("billing flags and expiry defaults", () => {
  it("keeps the credit layer off and in shadow mode unless switched explicitly", () => {
    expect(billingCreditsEnabled({})).toBe(false);
    expect(billingCreditsEnabled({ BILLING_CREDITS_ENABLED: "1" })).toBe(false);
    expect(billingCreditsEnabled({ BILLING_CREDITS_ENABLED: "true" })).toBe(true);
    expect(billingEnforceMode({})).toBe("shadow");
    expect(billingEnforceMode({ BILLING_ENFORCE: "ENFORCE" })).toBe("shadow");
    expect(billingEnforceMode({ BILLING_ENFORCE: "enforce" })).toBe("enforce");
  });

  it("applies D-10: purchases 24 months, promos 30 days, the allowance at month end", () => {
    const from = new Date("2026-10-12T09:30:00Z");
    expect(defaultExpiry("allowance", from).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(monthEnd(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(defaultExpiry("purchase", from).toISOString()).toBe("2028-10-13T00:00:00.000Z");
    expect(defaultExpiry("bonus", from).toISOString()).toBe("2028-10-13T00:00:00.000Z");
    expect(defaultExpiry("promo", from).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(defaultExpiry("promo", new Date("2026-10-12T23:59:59Z")).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(defaultExpiry("grant", from).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(() => defaultExpiry("contract_allowance", from)).toThrow("expiry_required");
    expect(addMonths(new Date("2024-02-29T00:00:00Z"), 24).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    // The rules are configurable.
    expect(defaultExpiry("promo", from, { ...CREDIT_EXPIRY_DEFAULTS, promo: { days: 7 } }).toISOString())
      .toBe("2026-10-20T00:00:00.000Z");
  });

  it("runs the verifier at start-up and nightly, and expiry hourly", () => {
    const night = new Date("2026-10-13T03:05:00Z");
    expect(billingVerificationDue(0, new Date("2026-10-12T15:00:00Z"))).toBe(true);
    expect(billingVerificationDue(new Date("2026-10-12T15:00:00Z").getTime(), new Date("2026-10-12T16:00:00Z"))).toBe(false);
    expect(billingVerificationDue(new Date("2026-10-12T15:00:00Z").getTime(), night)).toBe(true);
    expect(billingVerificationDue(new Date("2026-10-13T03:00:30Z").getTime(), night)).toBe(false);
    expect(billingExpiryDue(0)).toBe(true);
    expect(billingExpiryDue(night.getTime() - 3_599_000, night)).toBe(false);
    expect(billingExpiryDue(night.getTime() - 3_600_000, night)).toBe(true);
  });
});
