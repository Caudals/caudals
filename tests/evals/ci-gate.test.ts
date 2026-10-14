/**
 * Launch L-19 (spec v2 P-27): the release gate on fixtures. pass and fail
 * against the threshold (exact at the boundary), unknown when the run cannot
 * give a result (infrastructure: failed, cancelled, paused; too few graded
 * answers; no threshold), pending while it runs or is graded.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/evals/repositories/db", () => ({ withTenant: vi.fn() }));
const { gateVerdict } = await import("@/lib/evals/monitoring/ci-runs");
const { gateThresholdSchema } = await import("@/lib/evals/monitoring/gate-threshold");
type Row = { caseRevisionId: string; title: string; severity: string; outcome: "pass" | "partial" | "fail" | "unscorable" | null; assessmentId: string | null };

const rows = (outcomes: Array<Row["outcome"]>, severity = "medium"): Row[] =>
  outcomes.map((outcome, index) => ({ caseRevisionId: `c${index}`, title: `Q${index}`, severity, outcome, assessmentId: outcome ? `a${index}` : null }));
const done = { runStatus: "completed", phase: "done", reasonCode: null, stale: false };

describe("release gate verdict (launch L-19)", () => {
  it("passes at or above the threshold and fails below it", () => {
    const eightOfTen = rows(["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail", "partial"]);
    expect(gateVerdict({ ...done, threshold: 80, rows: eightOfTen })).toEqual({ status: "pass", reasons: [], score: { pass: 8, scored: 10, percent: 80 } });
    expect(gateVerdict({ ...done, threshold: 80.01, rows: eightOfTen })).toMatchObject({ status: "fail", reasons: ["below_threshold"] });
    expect(gateVerdict({ ...done, threshold: 0, rows: rows(["fail", "fail"]) }).status).toBe("pass");
    expect(gateVerdict({ ...done, threshold: 100, rows: rows(["pass", "pass", "partial"]) }).status).toBe("fail");
    // Two thirds is 66.666…%: 66.66 passes, 66.67 does not.
    expect(gateVerdict({ ...done, threshold: 66.66, rows: rows(["pass", "pass", "fail"]) }).status).toBe("pass");
    expect(gateVerdict({ ...done, threshold: 66.67, rows: rows(["pass", "pass", "fail"]) }).status).toBe("fail");
    // Unscorable answers do not count against the score.
    expect(gateVerdict({ ...done, threshold: 100, rows: rows(["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "unscorable"]) }).status).toBe("pass");
    // A partial run with enough graded answers is judged like a completed one.
    expect(gateVerdict({ ...done, runStatus: "partial", threshold: 50, rows: rows(["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass"]) }).status).toBe("pass");
  });

  it("answers unknown when the infrastructure gave no result", () => {
    expect(gateVerdict({ ...done, runStatus: "failed", threshold: 80, rows: [] })).toEqual({ status: "unknown", reasons: ["run_failed"], score: null });
    expect(gateVerdict({ ...done, runStatus: "canceled", threshold: 80, rows: [] }).reasons).toEqual(["run_canceled"]);
    expect(gateVerdict({ ...done, runStatus: "cancel_requested", threshold: 80, rows: [] }).reasons).toEqual(["run_canceled"]);
    expect(gateVerdict({ ...done, runStatus: "paused", reasonCode: "credits_exhausted", threshold: 80, rows: [] }).reasons).toEqual(["credits_exhausted"]);
    expect(gateVerdict({ ...done, runStatus: "paused", reasonCode: "cap_reached", threshold: 80, rows: [] }).reasons).toEqual(["cap_reached"]);
    expect(gateVerdict({ ...done, runStatus: "pause_requested", reasonCode: "operator", threshold: 80, rows: [] }).reasons).toEqual(["run_paused"]);
    // Fewer than 90 % of the questions graded, or a critical one missing.
    expect(gateVerdict({ ...done, threshold: 50, rows: rows(["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", null, null]) })).toMatchObject({ status: "unknown", reasons: ["coverage_inadequate"] });
    expect(gateVerdict({ ...done, threshold: 50, rows: [...rows(["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass"]), ...rows([null], "critical")] })).toMatchObject({ status: "unknown", reasons: ["critical_unassessed"] });
    expect(gateVerdict({ ...done, threshold: 50, rows: rows(["unscorable", "unscorable"]) })).toMatchObject({ status: "unknown", reasons: ["no_scored_answers"] });
    expect(gateVerdict({ ...done, threshold: 50, rows: [] })).toMatchObject({ status: "unknown", reasons: ["coverage_inadequate"] });
    // No threshold on the schedule or the test set: the gate cannot decide, and says so.
    expect(gateVerdict({ ...done, threshold: null, rows: rows(["pass"]) })).toEqual({ status: "unknown", reasons: ["threshold_not_set"], score: { pass: 1, scored: 1, percent: 100 } });
  });

  it("is pending while the run executes or is graded", () => {
    for (const runStatus of ["queued", "running"]) expect(gateVerdict({ ...done, runStatus, threshold: 80, rows: [] })).toEqual({ status: "pending", reasons: ["run_in_progress"], score: null });
    expect(gateVerdict({ ...done, phase: "grading", threshold: 80, rows: rows(["pass"]) })).toMatchObject({ status: "pending", reasons: ["grading"] });
    // A run stuck after execution for 30 minutes is judged on what was graded.
    expect(gateVerdict({ ...done, phase: "reporting", stale: true, threshold: 80, rows: rows(["pass"]) }).status).toBe("pass");
  });

  it("accepts thresholds from 0 to 100 with at most two decimals", () => {
    for (const value of [0, 80, 80.5, 66.67, 100, null]) expect(gateThresholdSchema.parse(value)).toBe(value);
    for (const value of [-1, 100.01, 80.123, "80", Number.NaN]) expect(gateThresholdSchema.safeParse(value).success).toBe(false);
  });
});
