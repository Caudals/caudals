/**
 * Plans v2 definitions (launch L-14): the flag, the PLAN_LIMIT_* kinds and
 * what unlocks each, the PAYG limits as migration 093 applies them, the
 * legacy (flag-off) answers, the allowance period and the EN/ES copy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  connectionUnlock, FREE_LIMITS, MONTHLY_ALLOWANCE_CREDITS, PAYG_LIMITS, PLAN_LIMIT_CODES, PLAN_LIMIT_KINDS, planLimitKind, plansV2Enabled, unlockFor,
} from "../../lib/billing/plans";
import { EvalError, inputError, PlanLimitError } from "../../lib/evals/domain/errors";
import { allowanceKey, allowancePeriod } from "../../lib/billing/allowance";
import { messages } from "../../lib/evals/messages/en";
import { es } from "../../lib/evals/messages/es";

describe("plans v2 definitions", () => {
  it("reads PLANS_V2_ENABLED as on only for exactly true", () => {
    expect(plansV2Enabled({})).toBe(false);
    expect(plansV2Enabled({ PLANS_V2_ENABLED: "TRUE" })).toBe(false);
    expect(plansV2Enabled({ PLANS_V2_ENABLED: "1" })).toBe(false);
    expect(plansV2Enabled({ PLANS_V2_ENABLED: "true" })).toBe(true);
  });

  it("names every limit with a PLAN_LIMIT_* code and maps it back", () => {
    expect(Object.values(PLAN_LIMIT_CODES)).toEqual(["PLAN_LIMIT_SYSTEMS", "PLAN_LIMIT_RUNS", "PLAN_LIMIT_QUESTIONS", "PLAN_LIMIT_CONNECTION", "PLAN_LIMIT_SCHEDULES", "PLAN_LIMIT_MEMBERS"]);
    for (const kind of PLAN_LIMIT_KINDS) expect(planLimitKind(PLAN_LIMIT_CODES[kind])).toBe(kind);
    expect(planLimitKind("PLAN_LIMIT")).toBeNull();
    expect(planLimitKind(undefined)).toBeNull();
    const error = new PlanLimitError("connection", "00000000-0000-4000-8000-000000000001", null, "imported_responses");
    expect(error).toBeInstanceOf(EvalError);
    expect(error).toMatchObject({ code: "PLAN_LIMIT_CONNECTION", status: 403, kind: "connection" });
    expect(error.view()).toEqual({ kind: "connection", limit: null, connectionType: "imported_responses" });
  });

  it("says credits unlock what pay as you go adds to the free plan, and a managed plan everything else", () => {
    for (const kind of ["systems", "runs", "questions", "schedules", "members"] as const) expect(unlockFor("free", kind)).toBe("credits");
    expect(unlockFor("free", "connection", "imported_responses")).toBe("credits");
    expect(unlockFor("free", "connection", "private_runner")).toBe("managed");
    expect(unlockFor("free", "connection", "provider_native")).toBe("managed");
    for (const plan of ["payg", "managed", "partner"] as const) for (const kind of PLAN_LIMIT_KINDS) expect(unlockFor(plan, kind)).toBe("managed");
    expect(connectionUnlock("free", FREE_LIMITS.connectionTypes, "website")).toBeNull();
    expect(connectionUnlock("free", FREE_LIMITS.connectionTypes, "imported_responses")).toBe("credits");
    expect(connectionUnlock("payg", PAYG_LIMITS.connectionTypes, "private_runner")).toBe("managed");
  });

  it("matches §6.5 and the values migration 093 applies on the first purchase", () => {
    expect(PAYG_LIMITS).toMatchObject({ systems: 10, questionsPerSet: 500, runsPerMonth: null, activeRuns: 2, members: 10, schedules: true });
    expect(FREE_LIMITS).toMatchObject({ systems: 1, questionsPerSet: 50, runsPerMonth: 3, activeRuns: 1, members: null, schedules: false });
    expect(MONTHLY_ALLOWANCE_CREDITS).toBe(1000);
    const sql = readFileSync("db/migrations/093_evals_plans_v2.sql", "utf8");
    expect(sql).toContain("greatest(e.max_systems, 10)");
    expect(sql).toContain("greatest(e.max_tests_per_set, 500)");
    expect(sql).toContain("max_runs_per_month = NULL");
    expect(sql).toContain("greatest(e.max_active_runs, 2)");
    expect(sql).toContain("greatest(coalesce(e.max_members, 0), 10)");
    expect(sql).toContain("ARRAY['website','openai_compatible','https_json','imported_responses']");
    expect([...PAYG_LIMITS.connectionTypes]).toEqual([...PAYG_LIMITS.connectionTypes].sort());
  });

  it("keeps today's generic answer for database limits while plans v2 is off", () => {
    expect(inputError(new Error("PLAN_LIMIT_SYSTEMS"))).toMatchObject({ code: "PLAN_LIMIT", status: 403,
      message: "The free plan includes one AI system. Delete the current one or talk to us about a pilot." });
    expect(inputError(new Error("PLAN_LIMIT_RUNS"))).toMatchObject({ code: "PLAN_LIMIT", status: 403,
      message: "The free plan includes three runs a month. Talk to us about a pilot for more." });
    expect(inputError(new Error("PLAN_LIMIT_MEMBERS"))).toMatchObject({ code: "PLAN_LIMIT", status: 403 });
    // A typed error passes through untouched.
    expect(inputError(new PlanLimitError("systems", null))).toBeNull();
  });

  it("keys the allowance by UTC month", () => {
    expect(allowancePeriod(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(allowancePeriod(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
    expect(allowanceKey("2026-12")).toBe("allowance:2026-12");
  });

  it("has every upgrade-dialog and plan string in English and Spanish", () => {
    const keys = Object.keys(messages).filter(key => /^(limit|availableWith|availableOnManaged|clientPlanP)/.test(key));
    expect(keys.length).toBeGreaterThanOrEqual(40);
    for (const kind of PLAN_LIMIT_KINDS) {
      expect(keys).toContain(`limitTitle_${kind}`);
      expect(keys).toContain(`limitNow_${kind}`);
      expect(keys).toContain(`limitCredits_${kind}`);
    }
    // "Partner" reads the same in both languages.
    const same = new Set(["limitPlan_partner", "clientPlanPartner"]);
    for (const key of keys) {
      expect(es[key as keyof typeof es], key).toBeTruthy();
      if (!same.has(key)) expect(es[key as keyof typeof es], key).not.toBe(messages[key as keyof typeof messages]);
    }
  });
});
