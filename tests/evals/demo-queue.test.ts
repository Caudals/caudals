import { afterEach, describe, expect, it, vi } from "vitest";
import { nextAdmissible, queueEta, runEta } from "@/lib/demo/eta";
import { costOf, eurCeil, fallbackConfig, holdFor, runEstimateEur } from "@/lib/demo/fallback";
import { coolDownMs, health, isAvailabilityCode, isDown, markDown, markUp, resetHealth } from "@/lib/demo/health";

afterEach(() => { vi.unstubAllEnvs(); resetHealth(); });

describe("demo queue order", () => {
  const run = (id: string, kind: "website" | "openai_compatible" = "website") => ({ id, target_kind: kind });
  const slots = (active: number, website: number) => ({ active, website, maxActive: 3, maxWebsite: 2 });

  it("admits the oldest waiting run first", () => {
    expect(nextAdmissible([run("a"), run("b"), run("c")], slots(0, 0))?.id).toBe("a");
  });

  it("admits nothing while every slot is taken", () => {
    expect(nextAdmissible([run("a", "openai_compatible")], slots(3, 0))).toBeNull();
  });

  it("lets an API run pass a website run that waits for the browser, never another website run", () => {
    const waiting = [run("w1"), run("w2"), run("api", "openai_compatible"), run("w3")];
    expect(nextAdmissible(waiting, slots(2, 2))?.id).toBe("api");
    expect(nextAdmissible([run("w1"), run("w2")], slots(2, 2))).toBeNull();
    expect(nextAdmissible(waiting, slots(1, 1))?.id).toBe("w1");
  });
});

describe("demo ETA", () => {
  const durations = { p50: 240, p90: 480 };
  it("grows with the place in line, in rounds of the active slots", () => {
    expect(queueEta(1, 3, durations)).toEqual({ min: 240, max: 960 });
    expect(queueEta(3, 3, durations)).toEqual({ min: 240, max: 960 });
    expect(queueEta(4, 3, durations)).toEqual({ min: 480, max: 1440 });
    expect(queueEta(0, 0, durations)).toEqual({ min: 240, max: 960 });
  });
  it("counts down for a run in progress without reaching zero", () => {
    expect(runEta(60, durations)).toEqual({ min: 180, max: 420 });
    expect(runEta(10_000, durations)).toEqual({ min: 20, max: 60 });
  });
});

describe("fallback cost accounting", () => {
  it("holds at least the real cost of any reply within the limits", () => {
    vi.stubEnv("DEMO_FALLBACK_INPUT_EUR_PER_MTOK", "0.25");
    vi.stubEnv("DEMO_FALLBACK_OUTPUT_EUR_PER_MTOK", "1.5");
    const config = fallbackConfig();
    const hold = holdFor(30_000, 4_500, config);
    // Even one token per input byte fits; average ratios are not a bound.
    expect(costOf({ prompt_tokens: 30_000 / 4, completion_tokens: 4_500 }, hold, config)).toBeLessThan(hold);
    expect(costOf({ prompt_tokens: 30_000, completion_tokens: 4_500 }, hold, config)).toBeLessThanOrEqual(hold);
    expect(runEstimateEur(config)).toBeGreaterThan(0.01);
    expect(runEstimateEur(config)).toBeLessThan(0.05);
    const denseBytes = Buffer.byteLength("中文🔬".repeat(5_000), "utf8");
    expect(holdFor(denseBytes, 4_500, config)).toBeGreaterThan(
      costOf({ prompt_tokens: denseBytes, completion_tokens: 4_500 }, 0, config),
    );
  });

  it("prefers the provider's own cost, converted conservatively, and settles at the hold when unknown", () => {
    const config = { ...fallbackConfig(), usdToEur: 1 };
    expect(costOf({ cost: 0.0123456, prompt_tokens: 1, completion_tokens: 1 }, 0.5, config)).toBe(0.012346);
    expect(costOf({ prompt_tokens: 1_000_000, completion_tokens: 0 }, 0.5, { ...config, inputEurPerMTok: 0.25 })).toBe(0.25);
    expect(costOf(null, 0.5, config)).toBe(0.5);
    expect(costOf({}, 0.5, config)).toBe(0.5);
    expect(costOf({ prompt_tokens: null, completion_tokens: null }, 0.5, config)).toBe(0.5);
    expect(costOf({ prompt_tokens: "", completion_tokens: "" }, 0.5, config)).toBe(0.5);
    expect(eurCeil(0.0000001)).toBe(0.000001);
  });

  it("reads the cap and model from the environment, defaulting to five euros and Gemini 3.1 Flash-Lite", () => {
    expect(fallbackConfig()).toMatchObject({ dailyCapEur: 5, model: "google/gemini-3.1-flash-lite", endpoint: "https://openrouter.ai/api/v1/chat/completions" });
    vi.stubEnv("DEMO_FALLBACK_DAILY_EUR", "2.5");
    vi.stubEnv("DEMO_FALLBACK_MODEL", "other/model");
    expect(fallbackConfig()).toMatchObject({ dailyCapEur: 2.5, model: "other/model" });
    vi.stubEnv("DEMO_FALLBACK_DAILY_EUR", "-1");
    expect(fallbackConfig().dailyCapEur).toBe(5);
  });
});

describe("model circuits", () => {
  it("opens on availability failures only, for a cool-down, and closes on success", () => {
    expect(isAvailabilityCode("model_rate_limited")).toBe(true);
    expect(isAvailabilityCode("model_http_503")).toBe(true);
    expect(isAvailabilityCode("model_http_403")).toBe(true);
    expect(isAvailabilityCode("model_unusable")).toBe(false);
    expect(isAvailabilityCode("model_http_400")).toBe(false);
    const now = Date.now();
    markDown("primary", "model_rate_limited", now);
    expect(isDown("primary", now + 1_000)).toBe(true);
    expect(isDown("primary", now + coolDownMs("primary", "model_rate_limited") + 1)).toBe(false);
    expect(health(now + 1_000).primary).toEqual({ down: true, code: "model_rate_limited" });
    markUp("primary");
    expect(isDown("primary")).toBe(false);
    expect(coolDownMs("fallback", "model_http_403")).toBeGreaterThan(coolDownMs("fallback", "model_rate_limited"));
  });
});
