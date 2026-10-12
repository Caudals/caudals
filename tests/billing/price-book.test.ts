/**
 * Price-book arithmetic (spec v2 §6.4, D-03): rounding to the 5-credit grid
 * with a 10-credit floor, the multiplier and routing fee, the seeded revision
 * 1 table, draft composition, and the weekly price check / monthly FX rules.
 */
import { describe, expect, it } from "vitest";
import {
  composeDraftRates, creditRateUcrPerMillion, decimalMicros, draftInputSchema, eurCostPerMillion, gridRateUcr, modelKey, modelProvider,
  planningRunCredits, REVISION_1_ACTIONS, REVISION_1_FX, REVISION_1_MODELS, roundCreditRate, tokenMargin, type ModelRate,
} from "../../lib/billing/price-book";
import {
  comparePriceBook, firstWorkingDay, fxUpdateDue, listingIdFor, parseEcbDaily, parseOpenRouterModels, perTokenToPerMillion, priceCheckDue,
  priceCheckMarkdown,
} from "../../lib/billing/price-check";
import { creditsToUcr } from "../../lib/billing/units";

const credits = (ucr: bigint) => Number(ucr / BigInt(1_000_000));
const rate = (usd: string, fee = 0, multiplier?: string, fx: string = REVISION_1_FX.usdPerEur) =>
  credits(creditRateUcrPerMillion({ usdPerMillion: usd, fxUsdPerEur: fx, routingFeeBps: fee, multiplier }));

function seedRates(): ModelRate[] {
  return REVISION_1_MODELS.map((model, index) => ({
    id: String(index), label: model.label, provider: model.provider, modelId: model.modelId, minInputTokens: model.minInputTokens,
    inputUcrPerM: creditsToUcr(model.credits.input), outputUcrPerM: creditsToUcr(model.credits.output), cachedUcrPerM: null,
    costBasis: model.usdIn ? "list_price" : "internal_estimate", usdInputPerM: model.usdIn ?? null, usdOutputPerM: model.usdOut ?? null,
    usdCachedPerM: null, eurInputPerM: model.usdIn ? eurCostPerMillion({ usdPerMillion: model.usdIn, fxUsdPerEur: REVISION_1_FX.usdPerEur, routingFeeBps: model.feeBps }) : "0.5",
    eurOutputPerM: model.usdOut ? eurCostPerMillion({ usdPerMillion: model.usdOut, fxUsdPerEur: REVISION_1_FX.usdPerEur, routingFeeBps: model.feeBps }) : "0.5",
    routingFeeBps: model.feeBps, source: model.source, sourceAccessedOn: "2026-10-11",
  }));
}

describe("credit rate formula (§6.4, D-03)", () => {
  it("reproduces every list-priced row of the §6.4 table", () => {
    for (const model of REVISION_1_MODELS.filter(item => item.usdIn)) {
      expect([rate(model.usdIn!, model.feeBps), rate(model.usdOut!, model.feeBps)], model.label).toEqual([model.credits.input, model.credits.output]);
    }
    // Gemini 3.8 Flash from 1 Jan 2027 (the scheduled revision 2).
    expect([rate("1.50"), rate("7.50")]).toEqual([195, 970]);
  });

  it("matches the 'our cost' column (FX 1.1605, +5.5 % through OpenRouter, Google direct)", () => {
    const cost = (usd: string, fee: number) => eurCostPerMillion({ usdPerMillion: usd, fxUsdPerEur: "1.1605", routingFeeBps: fee });
    expect(cost("0.10", 550)).toBe("0.090909");
    expect(cost("0.25", 0)).toBe("0.215424");
    expect(cost("1.32", 550)).toBe("1.200000");
    expect(cost("12.00", 0)).toBe("10.340371");
    expect(cost("20.00", 550)).toBe("18.181818");
  });

  it("rounds up to the next 5 credits per 1M and keeps exact multiples", () => {
    // 1.32 $ × 1.055 / 1.1605 × 1.5 × 100 is exactly 180 credits: no rounding up.
    expect(rate("1.32", 550)).toBe(180);
    // One micro-dollar more crosses the step.
    expect(rate("1.320001", 550)).toBe(185);
    expect(roundCreditRate(BigInt(1801), BigInt(10))).toBe(BigInt(185));
    expect(roundCreditRate(BigInt(1800), BigInt(10))).toBe(BigInt(180));
    expect(roundCreditRate(BigInt(1), BigInt(1000))).toBe(BigInt(10));
  });

  it("never prices below 10 credits per 1M, even at $0", () => {
    expect(rate("0.000001")).toBe(10);
    expect(rate("0")).toBe(10);
    expect(rate("0.05")).toBe(10); // 6.46 credits → floor
    expect(rate("0.08")).toBe(15); // 10.34 credits → next step
  });

  it("applies the multiplier and the routing fee", () => {
    expect(rate("2.00", 0, "1")).toBe(175); // 172.34 → 175
    expect(rate("2.00", 0, "1.5")).toBe(260); // 258.51 → 260
    expect(rate("2.00", 0, "2.5")).toBe(435); // 430.85 → 435
    expect(rate("2.00", 550, "1.5")).toBe(275); // 272.73 → 275
    expect(rate("2.00", 550, "1.5", "1.0")).toBe(320); // 316.5 → 320
    expect(() => creditRateUcrPerMillion({ usdPerMillion: "1", fxUsdPerEur: "1.1605", routingFeeBps: 0, multiplier: "0.9" })).toThrow("invalid_multiplier");
    expect(() => creditRateUcrPerMillion({ usdPerMillion: "1", fxUsdPerEur: "0", routingFeeBps: 0 })).toThrow("invalid_fx");
    expect(() => creditRateUcrPerMillion({ usdPerMillion: "1", fxUsdPerEur: "1", routingFeeBps: -1 })).toThrow("invalid_fee");
    expect(() => decimalMicros("1.0000001")).toThrow("invalid_decimal");
  });

  it("keeps capacity-priced rates on the grid", () => {
    expect(gridRateUcr(50)).toBe(BigInt(50_000_000));
    expect(gridRateUcr("200")).toBe(BigInt(200_000_000));
    expect(() => gridRateUcr(52)).toThrow("rate_off_grid");
    expect(() => gridRateUcr(5)).toThrow("rate_off_grid");
    expect(() => gridRateUcr("12.5")).toThrow("rate_off_grid");
  });

  it("gives the §6.4 engine credits for a 50-question run and the stated margins", () => {
    const expected: Record<string, number> = {
      "Caudals Local (DeepSeek V4 Flash on the DGX)": 8, "GPT-6 Luna (OpenAI)": 3, "Claude Haiku 5.5, prompts up to 100K (Anthropic)": 3,
      "Claude Haiku 5.5, prompts over 100K (Anthropic)": 12, "Gemini 3.1 Flash-Lite (Google)": 6, "DeepSeek V4.1 Flash, peak hours (DeepSeek)": 7,
      "Mistral Large (Mistral, EU)": 10, "Gemini 3.8 Flash (Google)": 17, "DeepSeek V4 Pro, peak hours (DeepSeek)": 26,
      "Gemini 3.1 Pro preview, prompts up to 200K (Google)": 49, "GPT-6.1 Sol (OpenAI)": 48, "Claude Sonnet 5.5 (Anthropic)": 48, "Claude Opus 5.5 (Anthropic)": 96,
    };
    for (const row of seedRates()) expect(Number(planningRunCredits(row)), row.label).toBe(expected[row.label]);
    expect(Number(planningRunCredits({ inputUcrPerM: creditsToUcr(195), outputUcrPerM: creditsToUcr(970) }))).toBe(34);
    const luna = seedRates().find(row => row.modelId === "openai/gpt-6-luna")!;
    expect(tokenMargin(luna.eurInputPerM, luna.inputUcrPerM)).toBeCloseTo(0.394, 3);
    expect(tokenMargin(luna.eurOutputPerM, luna.outputUcrPerM)).toBeCloseTo(0.351, 3);
    for (const row of seedRates().filter(item => item.costBasis === "list_price")) {
      expect(tokenMargin(row.eurOutputPerM, row.outputUcrPerM), row.label).toBeGreaterThanOrEqual(0.33);
    }
  });

  it("seeds the six §6.3 meters", () => {
    expect(Object.fromEntries(Object.entries(REVISION_1_ACTIONS).map(([meter, value]) => [meter, creditsToUcr(value)]))).toEqual({
      website_question: BigInt(5_000_000), api_question: BigInt(2_000_000), graded_answer: BigInt(1_000_000),
      web_page_read: BigInt(1_000_000), document_page: BigInt(500_000), web_search_query: BigInt(2_000_000),
    });
  });
});

describe("provider keys", () => {
  it("files a provider revision under its provider and normalised model id", () => {
    expect(modelProvider("dgx", "http://192.0.2.1:11434/v1")).toBe("dgx");
    expect(modelProvider("openai_compatible", "https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(modelProvider("openai_compatible", "https://generativelanguage.googleapis.com/v1beta/openai")).toBe("google");
    expect(modelProvider("openai_compatible", "https://integrate.api.nvidia.com/v1")).toBe("nvidia");
    expect(modelProvider("openai_compatible", "https://api.groq.com/openai/v1")).toBe("host_api_groq_com");
    expect(modelKey("google", "models/gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(modelKey("openrouter", "models/x")).toBe("models/x");
  });
});

describe("draft composition", () => {
  const base = { models: seedRates(), actions: Object.entries(REVISION_1_ACTIONS).map(([meter, value]) => ({ meter: meter as keyof typeof REVISION_1_ACTIONS, unit: "question", ucrPerUnit: creditsToUcr(value), label: meter })) };

  it("recomputes list prices for a new FX and keeps capacity-priced rows", () => {
    const draft = composeDraftRates(base, draftInputSchema.parse({ title: "FX October" }), "1.1206", "1.5");
    const luna = draft.models.find(row => row.model_id === "openai/gpt-6-luna")!;
    expect([credits(BigInt(luna.input_ucr_per_m)), credits(BigInt(luna.output_ucr_per_m))]).toEqual([15, 75]);
    const local = draft.models.find(row => row.provider === "dgx")!;
    expect([local.input_ucr_per_m, local.output_ucr_per_m]).toEqual(["50000000", "200000000"]);
    expect(draft.models).toHaveLength(13);
    expect(draft.actions).toHaveLength(6);
  });

  it("applies price changes, additions and removals by provider, model and tier", () => {
    const draft = composeDraftRates(base, draftInputSchema.parse({
      title: "DeepSeek off-peak",
      models: [
        { provider: "openrouter", modelId: "deepseek/deepseek-v4.1-flash", usdInputPerM: "0.15", usdOutputPerM: "0.60" },
        { provider: "nvidia", modelId: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash (NVIDIA NIM)", usdInputPerM: "0.10", usdOutputPerM: "1.20", source: "https://build.nvidia.com" },
        { provider: "openrouter", modelId: "anthropic/claude-haiku-5.5", minInputTokens: 100000, remove: true },
        { provider: "dgx", modelId: null, costBasis: "internal_estimate", credits: { input: 45, output: 180 } },
      ],
      actions: [{ meter: "website_question", credits: "4" }],
    }), "1.1605", "1.5");
    const by = (id: string | null) => draft.models.find(row => row.model_id === id)!;
    expect([by("deepseek/deepseek-v4.1-flash").input_ucr_per_m, by("deepseek/deepseek-v4.1-flash").output_ucr_per_m]).toEqual(["25000000", "85000000"]);
    expect(by("z-ai/glm-5.3-flash")).toMatchObject({ provider: "nvidia", routing_fee_bps: 0, input_ucr_per_m: "15000000", output_ucr_per_m: "160000000" });
    expect(draft.models.filter(row => row.model_id === "anthropic/claude-haiku-5.5")).toHaveLength(1);
    expect([by(null).input_ucr_per_m, by(null).output_ucr_per_m]).toEqual(["45000000", "180000000"]);
    expect(draft.actions.find(action => action.meter === "website_question")!.ucr_per_unit).toBe("4000000");
  });

  it("rejects off-grid capacity rates and incomplete new models", () => {
    expect(() => composeDraftRates(base, draftInputSchema.parse({ title: "Bad", models: [{ provider: "dgx", modelId: null, costBasis: "internal_estimate", credits: { input: 47, output: 200 } }] }), "1.1605", "1.5"))
      .toThrow("INPUT_INVALID");
    expect(() => composeDraftRates(base, draftInputSchema.parse({ title: "Bad", models: [{ provider: "openai", modelId: "gpt-x", usdInputPerM: "1", usdOutputPerM: "2" }] }), "1.1605", "1.5"))
      .toThrow("INPUT_INVALID");
  });
});

describe("weekly price check and monthly FX", () => {
  const listings = parseOpenRouterModels({ data: [
    { id: "openai/gpt-6-luna", pricing: { prompt: "0.0000001", completion: "0.0000005" } },
    { id: "deepseek/deepseek-v4.1-flash", pricing: { prompt: "0.00000015", completion: "0.0000006" } },
    { id: "google/gemini-3.8-flash", pricing: { prompt: "0.00000075", completion: "0.00000375" } },
    { id: "anthropic/claude-opus-5.5", pricing: { prompt: "0.0000041", completion: "0.00002" } },
    { id: "broken", pricing: { prompt: "-1", completion: "0" } },
  ] });

  it("converts per-token USD exactly", () => {
    expect(perTokenToPerMillion("0.0000001")).toBe("0.100000");
    expect(perTokenToPerMillion("0.0000000232")).toBe("0.023200");
    expect(perTokenToPerMillion("0.00000095526")).toBe("0.955260");
    expect(perTokenToPerMillion("0")).toBe("0.000000");
    expect(perTokenToPerMillion("-1")).toBeNull();
    expect(listings.get("broken")?.usdInputPerM).toBeNull();
  });

  it("reports changes, proxies and the 3 % recompute trigger", () => {
    const report = comparePriceBook({ revision: { id: "r1", revision: 1, fxUsdPerEur: "1.1605", multiplier: "1.5" }, models: seedRates() }, listings, { usdPerEur: "1.1605", date: "2026-10-01" });
    expect(report.checked).toBe(12);
    const row = (label: string) => report.changes.find(change => change.label.startsWith(label))!;
    expect(row("GPT-6 Luna")).toMatchObject({ status: "unchanged", recompute: false });
    expect(row("DeepSeek V4.1 Flash")).toMatchObject({ status: "changed", recompute: true, credits: { input: { book: "45", recomputed: "25" } } });
    expect(row("Gemini 3.8 Flash")).toMatchObject({ status: "unchanged", proxy: true, listing: "google/gemini-3.8-flash" });
    // +2.5 % on input: reported, but below the 3 % trigger.
    expect(row("Claude Opus 5.5")).toMatchObject({ status: "changed", recompute: false });
    expect(row("Claude Haiku 5.5, prompts over")).toMatchObject({ status: "unavailable" });
    expect(row("Mistral Large")).toMatchObject({ status: "unavailable" });
    expect(report.changed).toBe(2);
    expect(priceCheckMarkdown(report)).toContain("DeepSeek V4.1 Flash");
  });

  it("flags every list price for recomputation when FX moves more than 3 %", () => {
    const report = comparePriceBook({ revision: { id: "r1", revision: 1, fxUsdPerEur: "1.1605", multiplier: "1.5" }, models: seedRates() }, listings, { usdPerEur: "1.1206", date: "2026-10-09" });
    expect(report.fx).toMatchObject({ book: "1.1605", current: "1.1206", change: -0.0344 });
    expect(report.changes.find(change => change.label.startsWith("GPT-6 Luna"))).toMatchObject({ status: "unchanged", recompute: true, credits: { output: { book: "70", recomputed: "75" } } });
    expect(report.changes.filter(change => change.recompute)).toHaveLength(12);
    const small = comparePriceBook({ revision: { id: "r1", revision: 1, fxUsdPerEur: "1.1605", multiplier: "1.5" }, models: seedRates() }, listings, { usdPerEur: "1.15", date: "2026-10-09" });
    expect(small.changes.find(change => change.label.startsWith("GPT-6 Luna"))!.recompute).toBe(false);
  });

  it("maps price-book rows to OpenRouter listings", () => {
    expect(listingIdFor({ provider: "openrouter", modelId: "openai/gpt-6-luna" })).toEqual({ id: "openai/gpt-6-luna", proxy: false });
    expect(listingIdFor({ provider: "google", modelId: "gemini-3.8-flash" })).toEqual({ id: "google/gemini-3.8-flash", proxy: true });
    expect(listingIdFor({ provider: "mistral", modelId: "mistral-large-2512" })).toEqual({ id: "mistralai/mistral-large-2512", proxy: true });
    expect(listingIdFor({ provider: "dgx", modelId: null })).toBeNull();
    expect(listingIdFor({ provider: "nvidia", modelId: "z-ai/glm-5.3-flash" })).toBeNull();
  });

  it("parses the ECB daily file", () => {
    const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-09'><Cube currency='USD' rate='1.1206'/><Cube currency='JPY' rate='170.1'/></Cube></Cube></gesmes:Envelope>`;
    expect(parseEcbDaily(xml)).toEqual({ date: "2026-10-09", usdPerEur: "1.1206" });
    expect(() => parseEcbDaily("<Cube/>")).toThrow("ecb_rate_invalid");
  });

  it("runs FX on the first working day after 15:00 UTC and the price check weekly", () => {
    expect(firstWorkingDay(2026, 10).toISOString().slice(0, 10)).toBe("2026-11-02"); // 1 Nov 2026 is a Sunday
    expect(firstWorkingDay(2026, 9).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(fxUpdateDue("2026-10-01", new Date("2026-11-02T14:00:00Z"))).toBe(false);
    expect(fxUpdateDue("2026-10-01", new Date("2026-11-02T15:30:00Z"))).toBe(true);
    expect(fxUpdateDue("2026-11-02", new Date("2026-11-20T15:30:00Z"))).toBe(false);
    expect(fxUpdateDue(null, new Date("2026-10-12T09:00:00Z"))).toBe(true);
    expect(priceCheckDue(null)).toBe(true);
    expect(priceCheckDue(new Date("2026-10-05T10:00:00Z"), new Date("2026-10-12T09:59:00Z"))).toBe(false);
    expect(priceCheckDue(new Date("2026-10-05T10:00:00Z"), new Date("2026-10-12T10:00:00Z"))).toBe(true);
  });
});
