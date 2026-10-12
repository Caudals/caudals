/**
 * Run estimate (spec v2 §6.7): exact platform meters, token totals from per-call
 * statistics with the 20-sample fallback, tiers, the largest hold, ETA and the
 * §6.4 typical-run figures.
 */
import { describe, expect, it } from "vitest";
import {
  caseNeedsJudge, caseRepetitions, callStatsFor, connectionKindOf, engineCalls, estimateRun, runTokens, SEEDED_CALL_STATS, throughputFor, tierFor,
  type CallStats, type EstimateInput, type EstimateStats, type RoleModel, type StatsRow,
} from "../../lib/billing/estimate";
import { creditsToUcr, wholeCreditsUp } from "../../lib/billing/units";
import type { ActionMeter } from "../../lib/billing/price-book";

const c = (credits: number | string) => creditsToUcr(credits);
const ACTIONS: Record<ActionMeter, bigint> = {
  website_question: c(5), api_question: c(2), graded_answer: c(1), web_page_read: c(1), document_page: c("0.5"), web_search_query: c(2),
};
const stats = (overrides: Partial<CallStats> = {}): CallStats => ({ ...SEEDED_CALL_STATS.judge, samples: 0, source: "seeded", ...overrides });
const model = (input: number, output: number, extra: Partial<RoleModel> = {}): RoleModel => ({
  modelId: "m", free: false, webResearch: false, stats: stats(), tiers: [{ minInputTokens: 0, inputUcrPerM: c(input), outputUcrPerM: c(output), cachedUcrPerM: null, label: "rate" }], ...extra,
});
function input(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    units: { website: 0, api: 0, imported: 0 }, judgedUnits: 0, reportCalls: 0, generation: null, sources: { webPages: 0, documentPages: 0 },
    roles: {}, actionRates: ACTIONS, throughput: { website: { p50: 52, p90: 76, source: "seeded" }, api: { p50: 10, p90: 30, source: "seeded" } }, ...overrides,
  };
}

describe("run estimate", () => {
  it("reproduces the §6.4 typical run: 50 website questions and 10 pages on Local is 268 credits", () => {
    // Planning assumption: 100k input + 15k output engine tokens over the 50 judged answers, with no spread.
    const judge = model(50, 200, { stats: stats({ meanInput: 2000, meanOutput: 300, sdInput: 0, sdOutput: 0, p50Input: 2000, p50Output: 300 }) });
    const result = estimateRun(input({ units: { website: 50, api: 0, imported: 0 }, judgedUnits: 50, sources: { webPages: 10, documentPages: 0 }, roles: { judge } }));
    expect(result.p50Ucr).toBe(c(268));
    expect(result.p90Ucr).toBe(c(268));
    expect(result.lines.filter(line => line.kind === "meter")).toEqual([
      { kind: "meter", key: "website_question", quantity: 50, p50Ucr: c(250), p90Ucr: c(250) },
      { kind: "meter", key: "web_page_read", quantity: 10, p50Ucr: c(10), p90Ucr: c(10) },
    ]);
    // Opus 5.5 on the same run: 250 + 10 + 96 (55 + 40.95 rounded up per run).
    const opus = estimateRun(input({ units: { website: 50, api: 0, imported: 0 }, judgedUnits: 50, sources: { webPages: 10, documentPages: 0 }, roles: { judge: { ...judge, tiers: model(550, 2730).tiers } } }));
    expect(wholeCreditsUp(opus.p50Ucr)).toBe(BigInt(356));
  });

  it("counts every platform meter exactly, document pages at half a credit", () => {
    const result = estimateRun(input({ units: { website: 3, api: 4, imported: 5 }, sources: { webPages: 2, documentPages: 7 } }));
    expect(result.p50Ucr).toBe(c(15 + 8 + 5 + 2) + c("3.5"));
    expect(result.p90Ucr).toBe(result.p50Ucr);
  });

  it("uses n × mean for the median and adds 1.2816 × sd × √n for the p90", () => {
    const s = stats({ meanInput: 2000, meanOutput: 300, sdInput: 1000, sdOutput: 100, p50Input: 1800, p50Output: 280 });
    expect(runTokens(s, 0)).toEqual({ p50: { input: 0, output: 0 }, p90: { input: 0, output: 0 } });
    expect(runTokens(s, 100)).toEqual({ p50: { input: 200_000, output: 30_000 }, p90: { input: 212_816, output: 31_282 } });
    // One call: about the per-call p90, never below the per-call median.
    expect(runTokens(s, 1).p90.input).toBe(3282);
    expect(runTokens(stats({ meanInput: 10, sdInput: 0, p50Input: 50 }), 2).p90.input).toBe(100);
  });

  it("charges nothing for tokens on a free model and flags an unpriced one", () => {
    const free = estimateRun(input({ judgedUnits: 10, roles: { judge: model(15, 70, { free: true }) } }));
    expect(free.p90Ucr).toBe(BigInt(0));
    expect(free.unpriced).toEqual([]);
    const unpriced = estimateRun(input({ judgedUnits: 10, roles: { judge: { ...model(15, 70), tiers: [] } } }));
    expect(unpriced.unpriced).toEqual(["judge"]);
  });

  it("picks prompt-size tiers per call and holds at the token bound", () => {
    const tiers = [
      { minInputTokens: 0, inputUcrPerM: c(15), outputUcrPerM: c(70), cachedUcrPerM: null, label: "≤100K" },
      { minInputTokens: 100_000, inputUcrPerM: c(70), outputUcrPerM: c(345), cachedUcrPerM: null, label: ">100K" },
    ];
    expect(tierFor(tiers, 100_000)?.label).toBe("≤100K");
    expect(tierFor(tiers, 100_001)?.label).toBe(">100K");
    expect(tierFor([], 5)).toBeNull();
    const big = stats({ meanInput: 120_000, meanOutput: 1000, sdInput: 0, sdOutput: 0, p50Input: 120_000, p90Input: 120_000, inputBound: 150_000, outputBound: 4000 });
    const result = estimateRun(input({ judgedUnits: 1, roles: { judge: { ...model(0, 0), tiers, stats: big } } }));
    expect(result.p50Ucr).toBe(c("8.4") + c("0.345"));
    expect(result.largestHoldUcr).toBe(c("10.5") + c("1.38"));
    // Measured statistics are percentiles with fractions: totals and bounds round up to whole tokens.
    const measured = estimateRun(input({ judgedUnits: 3, roles: { judge: model(50, 200, { stats: stats({ meanInput: 2233.7, meanOutput: 329.2, sdInput: 965.9, sdOutput: 181.4, inputBound: 18054.4, outputBound: 1536 }) }) } }));
    expect(measured.largestHoldUcr).toBe(BigInt(Math.ceil((18055 * 50 + 1536 * 200))));
    expect(measured.p50Ucr).toBe(BigInt(Math.ceil(6702 * 50 + 988 * 200)));
  });

  it("adds web research queries and generation calls", () => {
    expect(engineCalls({ judgedUnits: 7, reportCalls: 1, generation: { questions: 50 } })).toEqual({ judge: 7, report_writer: 1, generator: 6, context_analyzer: 1 });
    expect(engineCalls({ judgedUnits: 0, reportCalls: 0, generation: null })).toEqual({ judge: 0, report_writer: 0, generator: 0, context_analyzer: 0 });
    const result = estimateRun(input({ judgedUnits: 10, generation: { questions: 12 }, roles: { judge: model(50, 200, { webResearch: true }), generator: model(50, 200, { webResearch: true, stats: { ...SEEDED_CALL_STATS.generator, samples: 0, source: "seeded" } }) } }));
    expect(result.lines.find(line => line.key === "web_search_query")).toMatchObject({ quantity: 12, p50Ucr: c(24) });
    expect(result.lines.find(line => line.key === "generator")).toMatchObject({ quantity: 2 });
  });

  it("estimates time from seconds per question, grading for imported answers", () => {
    const judge = model(50, 200, { stats: stats({ p50Seconds: 18, p90Seconds: 38 }) });
    expect(estimateRun(input({ units: { website: 10, api: 0, imported: 0 }, judgedUnits: 10, roles: { judge } })).etaSeconds).toEqual({ p50: 520, p90: 760 });
    expect(estimateRun(input({ units: { website: 0, api: 0, imported: 5 }, judgedUnits: 5, roles: { judge } })).etaSeconds).toEqual({ p50: 90, p90: 190 });
  });
});

describe("statistics fallbacks", () => {
  const row = (overrides: Partial<StatsRow>): StatsRow => ({
    kind: "tokens", role: "judge", provider: "dgx", model_id: "m", samples: 25, mean_input: 3000, sd_input: 500, p50_input: 2900, p90_input: 3600,
    mean_output: 400, sd_output: 50, p50_output: 390, p90_output: 460, p90_input_bound: 9000, p90_output_bound: 1536, p50_seconds: 10, p90_seconds: 20, ...overrides,
  });
  it("uses the role and model with 20 samples, else the role, else the seed", () => {
    const set = (rows: StatsRow[]): EstimateStats => ({ rows });
    expect(callStatsFor(set([row({}), row({ provider: null, model_id: null, samples: 300, mean_input: 1 })]), "judge", "dgx", "m")).toMatchObject({ source: "model", meanInput: 3000, samples: 25 });
    expect(callStatsFor(set([row({ samples: 19 }), row({ provider: null, model_id: null, samples: 300, mean_input: 2500 })]), "judge", "dgx", "m")).toMatchObject({ source: "role", meanInput: 2500 });
    expect(callStatsFor(set([row({ samples: 19 }), row({ provider: null, model_id: null, samples: 19 })]), "judge", "dgx", "m")).toMatchObject({ source: "seeded", meanInput: 2200, meanOutput: 330, samples: 19 });
    expect(callStatsFor(set([]), "generator", "openrouter", "x")).toMatchObject({ source: "seeded", meanInput: 28_000, meanOutput: 2500 });
    expect(callStatsFor(set([]), "context_analyzer", "dgx", "x")).toMatchObject({ meanInput: 22_000, meanOutput: 4000 });
  });
  it("uses measured throughput from three completed runs", () => {
    const tp = (samples: number): StatsRow => ({ ...row({}), kind: "throughput", role: "website", provider: null, model_id: null, samples, p50_seconds: 40, p90_seconds: 65 });
    expect(throughputFor({ rows: [tp(3)] }).website).toEqual({ p50: 40, p90: 65, source: "measured" });
    expect(throughputFor({ rows: [tp(2)] }).website).toEqual({ p50: 52, p90: 76, source: "seeded" });
    // A single run left open for a day must not set the tail while there are few runs.
    expect(throughputFor({ rows: [{ ...tp(6), p50_seconds: 57.5, p90_seconds: 5914 }] }).website).toEqual({ p50: 57.5, p90: 115, source: "measured" });
    expect(throughputFor({ rows: [{ ...tp(25), p50_seconds: 57.5, p90_seconds: 300 }] }).website).toEqual({ p50: 57.5, p90: 300, source: "measured" });
  });
});

describe("run planning", () => {
  it("meters each connection kind and finds judged questions", () => {
    expect(connectionKindOf("website")).toBe("website");
    expect(connectionKindOf("openai_compatible")).toBe("api");
    expect(connectionKindOf("private_runner")).toBe("api");
    expect(connectionKindOf("imported_responses")).toBe("imported");
    expect(connectionKindOf("website", "imported_responses")).toBe("imported");
    expect(caseNeedsJudge({ reference: { graders: [{ kind: "exact_match" }, { kind: "claims" }] } })).toBe(true);
    expect(caseNeedsJudge({ reference: { graders: [{ kind: "llm_judge" }] } })).toBe(true);
    expect(caseNeedsJudge({ reference: { graders: [{ kind: "exact_match" }] } })).toBe(false);
    expect(caseRepetitions({ limits: { repetitions: 3 } })).toBe(3);
    expect(caseRepetitions({ limits: { repetitions: 0 } })).toBe(1);
    expect(caseRepetitions(null)).toBe(1);
  });
});
