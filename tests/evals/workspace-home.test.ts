/**
 * Launch L-22 pure logic: the spot-check sample and review modes, connection
 * health and score trends, the "next step" for every stage that needs action,
 * the landing page flag, and Spanish for every new interface string.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coveredQuestions, reviewModeForPlan, spotCheckOrder, spotCheckRequired, spotCheckSample } from "@/lib/evals/review/spot-check";
import { fixAction, lastHealthy, scoreHistory, systemHealth, trendPoints } from "@/lib/evals/workspace/health";
import { landingPath, workspaceHomeEnabled } from "@/lib/evals/workspace/flags";
import { evaluationStage, nextStep } from "@/components/evals/evaluation-stage";
import { messages } from "@/lib/evals/messages/en";
import { es } from "@/lib/evals/messages/es";

describe("spot check", () => {
  const items = [
    { id: "a1", source: "A", severity: "low" },
    { id: "a2", source: "A", severity: "critical" },
    { id: "b1", source: "B", severity: "medium" },
    { id: "a3", source: "A", severity: "high" },
    { id: "c1", source: null, severity: null },
    { id: "b2", source: "B", severity: "high" },
  ];
  it("free and pay as you go spot-check; managed, partner and unknown plans keep the full review", () => {
    expect(reviewModeForPlan("free")).toBe("spot_check");
    expect(reviewModeForPlan("payg")).toBe("spot_check");
    for (const plan of ["managed", "partner", undefined, null, ""]) expect(reviewModeForPlan(plan)).toBe("full");
    expect(spotCheckRequired(48)).toBe(10);
    expect(spotCheckRequired(4)).toBe(4);
  });
  it("orders one question per source page in turn, the most severe first", () => {
    expect(spotCheckOrder(items)).toEqual(["a2", "b2", "c1", "a3", "b1", "a1"]);
  });
  it("keeps the sample stable, follows an edit and tops up after a removal", () => {
    const sample = spotCheckSample(items, [], 3);
    expect(sample).toEqual(["a2", "b2", "c1"]);
    const edited = items.map((item) => (item.id === "b2" ? { ...item, id: "b2-edited" } : item));
    expect(spotCheckSample(edited, sample.map((id) => (id === "b2" ? "b2-edited" : id)), 3)).toEqual(["a2", "b2-edited", "c1"]);
    expect(spotCheckSample(items.filter((item) => item.id !== "c1"), sample, 3)).toEqual(["a2", "b2", "a3"]);
    expect(spotCheckSample(items.slice(0, 2), [], 10)).toHaveLength(2);
  });
  it("counts only checked questions that are in the approved set, once", () => {
    expect(coveredQuestions(["a1", "a1", "zz", "b1"], ["a1", "b1", "c1"])).toEqual(["a1", "b1"]);
  });
});

describe("connection health and scores", () => {
  const system = (kind: string, fields: Record<string, unknown> = {}) => ({ id: "s", document: { kind }, connection_status: null, runner_status: null, ...fields });
  it("says connected or needs attention, and where Fix goes", () => {
    expect(systemHealth(system("website", { connection_status: "ready" }))).toBe("connected");
    expect(systemHealth(system("openai_compatible", { connection_status: "failed" }))).toBe("needs_attention");
    expect(systemHealth(system("website", { connection_status: "needs_operator" }))).toBe("needs_attention");
    expect(systemHealth(system("website", { connection_status: "queued" }))).toBe("checking");
    expect(systemHealth(system("https_json"))).toBe("not_checked");
    expect(systemHealth(system("imported_responses"))).toBe("manual");
    expect(systemHealth(system("private_runner", { runner_status: "connected" }))).toBe("connected");
    expect(systemHealth(system("private_runner", { runner_status: "token_expired" }))).toBe("needs_attention");
    expect(fixAction(system("website", { connection_status: "needs_operator" }))).toBe("reteach");
    expect(fixAction(system("openai_compatible", { connection_status: "failed" }))).toBe("key");
    expect(fixAction(system("private_runner", { runner_status: "pairing_required" }))).toBe("pair");
    expect(fixAction(system("website", { connection_status: "ready" }))).toBeNull();
    expect(fixAction(system("https_json"))).toBeNull();
    expect(lastHealthy(system("website", { connection_ok_at: "2026-10-01" }))).toBe("2026-10-01");
    expect(lastHealthy(system("private_runner", { runner_seen_at: "2026-10-02", connection_ok_at: "x" }))).toBe("2026-10-02");
  });
  it("keeps the latest three scored runs per system, newest first, and the change across them", () => {
    const report = (id: string, rate: number | null, at: string, target = "t1") => ({ id, evaluation_id: "e", target_id: target, strict_pass_rate: rate, run_created_at: at });
    const reports = [report("r1", 0.5, "2026-08-01"), report("r4", 0.8, "2026-10-01"), report("r2", 0.6, "2026-08-15"), report("r3", 0.7, "2026-09-01"), report("rx", null, "2026-10-05"), report("other", 0.1, "2026-10-06", "t2")];
    const history = scoreHistory(reports, (item) => item.target_id === "t1");
    expect(history.map((point) => point.reportId)).toEqual(["r4", "r3", "r2"]);
    expect(trendPoints(history)).toBe(20);
    expect(trendPoints(history.slice(0, 1))).toBeNull();
    expect(trendPoints([{ reportId: "a", rate: 0.5, at: null }, { reportId: "b", rate: 0.62, at: null }])).toBe(-12);
  });
});

describe("next step", () => {
  const base = { preparation_status: "draft", selected_suite_version_id: null, latest_run_status: null, source_ids: [], latest_source_id: null, reason_code: null, latest_run_execution_mode: null, latest_run_reason_code: null };
  const cases: Array<[Record<string, unknown>, boolean, string | null]> = [
    [{}, false, "nextStepAddSources"],
    [{ source_ids: ["s"] }, false, "nextStepGenerate"],
    [{ preparation_status: "needs_review" }, false, "nextStepReview"],
    [{ preparation_status: "needs_review", reason_code: "validation_failed" }, false, "nextStepRetryDraft"],
    [{ preparation_status: "needs_input" }, false, "nextStepAnswer"],
    [{ preparation_status: "needs_input", reason_code: "operator_paused" }, false, "nextStepResumePreparation"],
    [{ preparation_status: "failed" }, false, "nextStepPreparationFailed"],
    [{ preparation_status: "ready", selected_suite_version_id: "v" }, false, "nextStepStartRun"],
    [{ latest_run_status: "paused", latest_run_execution_mode: "imported_responses" }, false, "nextStepUploadAnswers"],
    [{ latest_run_status: "paused", latest_run_reason_code: "runner_wait" }, false, "nextStepStartRunner"],
    [{ latest_run_status: "paused", latest_run_reason_code: "credits_exhausted" }, false, "nextStepAddCredits"],
    [{ latest_run_status: "paused", latest_run_reason_code: "cap_reached" }, false, "nextStepCap"],
    [{ latest_run_status: "paused" }, false, "nextStepResumeRun"],
    [{ latest_run_status: "failed" }, false, "nextStepRunFailed"],
    [{ preparation_status: "generating" }, false, null],
    [{ latest_run_status: "running" }, false, null],
    [{ latest_run_status: "completed" }, true, null],
  ];
  it("names the next move exactly when the stage needs action", () => {
    for (const [fields, hasReport, expected] of cases) {
      const evaluation = { ...base, ...fields } as Parameters<typeof evaluationStage>[0];
      const stage = evaluationStage(evaluation, hasReport);
      expect(nextStep(evaluation, stage), JSON.stringify(fields)).toBe(expected);
      expect(stage.needsAction, JSON.stringify(fields)).toBe(expected !== null);
    }
  });
});

describe("landing page flag", () => {
  const member = { platformRole: null, workspaces: [{}] };
  it("is off unless WORKSPACE_HOME_ENABLED=true, and only moves workspace members", () => {
    expect(workspaceHomeEnabled({})).toBe(false);
    expect(workspaceHomeEnabled({ WORKSPACE_HOME_ENABLED: "1" })).toBe(false);
    expect(landingPath(member, {})).toBe("/workspace/evaluations");
    expect(landingPath(member, { WORKSPACE_HOME_ENABLED: "true" })).toBe("/workspace/home");
    expect(landingPath({ platformRole: "operator", workspaces: [{}] }, { WORKSPACE_HOME_ENABLED: "true" })).toBe("/ops");
    expect(landingPath({ platformRole: null, workspaces: [] }, { WORKSPACE_HOME_ENABLED: "true" })).toBe("/workspace/invitations");
  });
});

describe("interface strings", () => {
  it("every L-22 string has Spanish with the same placeholders", () => {
    const source = readFileSync("lib/evals/messages/en.ts", "utf8");
    const block = source.slice(source.indexOf("// Launch L-22"), source.indexOf("} as const;"));
    const keys = [...block.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]) as Array<keyof typeof messages>;
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      expect(es[key], key).toBeTruthy();
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(es[key]!), key).toEqual(placeholders(messages[key]));
    }
  });
});
