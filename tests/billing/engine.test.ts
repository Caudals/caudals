/**
 * Credit maths on the execution path (spec v2 §6.3, §6.8; L-11): holds,
 * captures, meters, source pages, modes and the budget window. Pure: the
 * database tests (tests/evals/billing-engine-*.test.ts) run the same
 * functions on the real path.
 */
import { describe, expect, it } from "vitest";
import {
  chargedUsage, engineBillingMode, engineChargeUcr, engineHoldUcr, meterChargeUcr, questionMeter, sourcePageCount,
} from "../../lib/billing/engine";
import { creditsToUcr, splitCapture } from "../../lib/billing/units";
import { budgetPeriodStart } from "../../lib/evals/budget/ledger";

const c = (credits: number | string) => creditsToUcr(credits);
const B = (value: number | string) => BigInt(value);
const LOCAL = { free: false, rates: { inputUcrPerMillion: c(50), outputUcrPerMillion: c(200) } };
const OPUS = { free: false, rates: { inputUcrPerMillion: c(550), outputUcrPerMillion: c(2730) } };

describe("engine credit maths", () => {
  it("holds the rate × the token bound and charges the rate × usage, exactly", () => {
    // 300 input + 40 output on Caudals Local (50 · 200 credits per 1M): 0.023 credits.
    expect(engineChargeUcr(LOCAL, { input: 300, output: 40, cached: 0 })).toBe(B(23_000));
    expect(engineChargeUcr(LOCAL, { input: 300, output: 5, cached: 0 })).toBe(B(16_000));
    // §6.4 planning run: 100k + 15k on Local = 5 + 3 = 8 credits.
    expect(engineChargeUcr(LOCAL, { input: 100_000, output: 15_000, cached: 0 })).toBe(c(8));
    expect(engineHoldUcr(LOCAL, { input: 18_100, output: 1536 })).toBe(B(905_000 + 307_200));
    // Opus: 1 token each rounds up to the next µcr once.
    expect(engineChargeUcr(OPUS, { input: 1, output: 1, cached: 0 })).toBe(B(3_280));
    // The capture never exceeds the hold for the same bound.
    const bound = { input: 4_000, output: 1_024 };
    for (const usage of [{ input: 4_000, output: 1_024, cached: 0 }, { input: 10, output: 1, cached: 0 }, { input: 4_000, output: 0, cached: 4_000 }]) {
      expect(engineChargeUcr(OPUS, usage) <= engineHoldUcr(OPUS, bound)).toBe(true);
    }
  });

  it("holds cached input at the dearer input rate and charges cached tokens at their own rate", () => {
    const cachedDearer = { free: false, rates: { inputUcrPerMillion: c(10), outputUcrPerMillion: c(20), cachedUcrPerMillion: c(30) } };
    expect(engineHoldUcr(cachedDearer, { input: 1_000_000, output: 0 })).toBe(c(30));
    expect(engineChargeUcr(cachedDearer, { input: 1_000_000, output: 0, cached: 1_000_000 })).toBe(c(30));
    const cachedCheaper = { free: false, rates: { inputUcrPerMillion: c(100), outputUcrPerMillion: c(200), cachedUcrPerMillion: c(10) } };
    expect(engineChargeUcr(cachedCheaper, { input: 1_000_000, output: 0, cached: 500_000 })).toBe(c(55));
    expect(() => engineChargeUcr(cachedCheaper, { input: 1, output: 0, cached: 2 })).toThrow("invalid_cached_usage");
  });

  it("charges nothing for free or unpriced models", () => {
    expect(engineHoldUcr({ free: true, rates: LOCAL.rates }, { input: 1000, output: 1000 })).toBe(B(0));
    expect(engineChargeUcr({ free: false, rates: null }, { input: 1000, output: 1000, cached: 0 })).toBe(B(0));
  });

  it("uses the provider's usage, or a bound that never exceeds the hold", () => {
    expect(chargedUsage({ input: 10, output: 5, cached: 2 }, { input: 100, output: 50 }, 999)).toEqual({ input: 10, output: 5, cached: 2, provenance: "provider_reported" });
    expect(chargedUsage(undefined, { input: 100, output: 50 }, 30)).toEqual({ input: 100, output: 30, cached: 0, provenance: "bounded_estimate" });
    const capped = chargedUsage(null, { input: 100, output: 50 }, 10_000);
    expect(capped.output).toBe(50);
    expect(engineChargeUcr(OPUS, capped)).toBe(engineHoldUcr(OPUS, { input: 100, output: 50 }));
  });

  it("captures at most the hold and releases the rest (ledger semantics)", () => {
    expect(splitCapture(B(23_000), B(400_000))).toEqual({ captured: B(23_000), released: B(377_000), overage: B(0) });
    expect(splitCapture(B(500_000), B(400_000))).toEqual({ captured: B(400_000), released: B(0), overage: B(100_000) });
  });

  it("meters platform work per unit (§6.3)", () => {
    expect(meterChargeUcr(c(5), 1)).toBe(c(5));
    expect(meterChargeUcr(c("0.5"), 7)).toBe(c("3.5"));
    expect(meterChargeUcr(c(2), 3)).toBe(c(6));
    expect(() => meterChargeUcr(c(1), 1.5)).toThrow("invalid_quantity");
    expect(questionMeter("website")).toBe("website_question");
    expect(questionMeter("openai_compatible")).toBe("api_question");
    expect(questionMeter("https_json")).toBe("api_question");
    expect(questionMeter("imported_responses")).toBe("graded_answer");
    expect(questionMeter("openai_compatible", "imported_responses")).toBe("graded_answer");
  });

  it("counts source pages: website pages read, PDF pages, other documents by length", () => {
    const site = ["# Home\nWelcome", "# Pricing\nFees", "# FAQ\nAnswers"].join("\n\n---\n\n");
    expect(sourcePageCount(site, "website", { pageLimit: 25 })).toBe(3);
    expect(sourcePageCount(site, "website", { pageLimit: 2 })).toBe(2);
    expect(sourcePageCount("", "website")).toBe(1);
    const pdf = "Page 1:\nIntro\n\nPage 2:\nTerms\n\nPage 3:\nAnnex";
    expect(sourcePageCount(pdf, "document", { extractionVersion: "pdf-text-v1" })).toBe(3);
    expect(sourcePageCount("x".repeat(6001), "document", { extractionVersion: "docx-text-v1" })).toBe(3);
    expect(sourcePageCount("short", "document")).toBe(1);
  });

  it("is off unless BILLING_CREDITS_ENABLED is exactly true, and shadow unless BILLING_ENFORCE=enforce", () => {
    expect(engineBillingMode({})).toBe("off");
    expect(engineBillingMode({ BILLING_CREDITS_ENABLED: "TRUE", BILLING_ENFORCE: "enforce" })).toBe("off");
    expect(engineBillingMode({ BILLING_CREDITS_ENABLED: "true" })).toBe("shadow");
    expect(engineBillingMode({ BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "shadow" })).toBe("shadow");
    expect(engineBillingMode({ BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "enforced" })).toBe("shadow");
    expect(engineBillingMode({ BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "enforce" })).toBe("enforce");
  });

  it("windows the workspace euro budget by UTC month (G8)", () => {
    expect(budgetPeriodStart(new Date("2026-10-31T23:59:59.999Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(budgetPeriodStart(new Date("2026-11-01T00:00:00.000Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(budgetPeriodStart(new Date("2027-01-01T00:30:00+01:00")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
