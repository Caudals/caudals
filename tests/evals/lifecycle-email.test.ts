import { describe, expect, it } from "vitest";
import {
  addMadridDays, decideStep, lifecycleConfig, madridParts, MIN_GAP_MS, nextWorkingTime, planCandidate, renderLifecycleEmail, stepDueAt,
  LIFECYCLE_STEPS, type LifecycleCandidate,
} from "@/lib/evals/operations/lifecycle-email";

const at = (iso: string) => new Date(iso);
const candidate = (overrides: Partial<LifecycleCandidate> = {}): LifecycleCandidate => ({
  user_id: "au_test", org_id: "00000000-0000-4000-8000-000000000001", workspace_name: "Acme", email: "owner@acme.example", name: "Ana García",
  locale: "en", signed_up_at: at("2026-10-07T08:00:00Z"), has_test_set: false, has_run: false, has_report: false, first_report_at: null,
  shared: false, runs_after_first_report: 0, last_activity_at: at("2026-10-07T08:00:00Z"), recorded: {}, last_sent_at: null, ...overrides,
});
const ALL = new Set(LIFECYCLE_STEPS);

describe("Madrid calendar and working hours", () => {
  it("adds calendar days across the autumn DST change, keeping the wall-clock time", () => {
    // Friday 23 Oct 2026, 17:30 CEST (UTC+2). Clocks go back on Sunday 25 Oct.
    const start = at("2026-10-23T15:30:00Z");
    const plus7 = addMadridDays(start, 7);
    expect(plus7.toISOString()).toBe("2026-10-30T16:30:00.000Z"); // 17:30 CET (UTC+1), not 24 h × 7
    expect(madridParts(plus7)).toMatchObject({ hour: 17, minute: 30, weekday: 5 });
  });

  it("adds calendar days across the spring DST change", () => {
    // Friday 27 Mar 2026, 10:30 CET. Clocks go forward on Sunday 29 Mar.
    const plus3 = addMadridDays(at("2026-03-27T09:30:00Z"), 3);
    expect(plus3.toISOString()).toBe("2026-03-30T08:30:00.000Z"); // Monday 10:30 CEST
  });

  it("moves sends to the next working morning, in local time on both sides of DST", () => {
    // Sunday 25 Oct 2026 (the change day), 10:00 local → Monday 09:00 CET = 08:00 UTC.
    expect(nextWorkingTime(at("2026-10-25T09:00:00Z")).toISOString()).toBe("2026-10-26T08:00:00.000Z");
    // Saturday 28 Mar 2026 → Monday 30 Mar 09:00 CEST = 07:00 UTC.
    expect(nextWorkingTime(at("2026-03-28T12:00:00Z")).toISOString()).toBe("2026-03-30T07:00:00.000Z");
    // Thursday 19:30 local → Friday 09:00.
    expect(nextWorkingTime(at("2026-10-22T17:30:00Z")).toISOString()).toBe("2026-10-23T07:00:00.000Z");
    // Tuesday 07:00 local → same day 09:00.
    expect(nextWorkingTime(at("2026-10-20T05:00:00Z")).toISOString()).toBe("2026-10-20T07:00:00.000Z");
    // Inside working hours: unchanged.
    expect(nextWorkingTime(at("2026-10-21T10:00:00Z")).toISOString()).toBe("2026-10-21T10:00:00.000Z");
  });

  it("dues D1 on the next calendar day in working hours, D0 at once", () => {
    // Saturday 24 Oct 2026, 23:30 CEST: D1 is Sunday 25 (the DST day) → Monday 26 Oct 09:00 CET.
    const signup = at("2026-10-24T21:30:00Z");
    expect(stepDueAt("d1_test_set", { signed_up_at: signup, first_report_at: null })!.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(stepDueAt("d0_welcome", { signed_up_at: signup, first_report_at: null })!.toISOString()).toBe("2026-10-24T21:32:00.000Z");
    // Thursday 22 Oct, 16:00 CEST: D3 lands on the Sunday → Monday 09:00 CET; D1 keeps 16:00 CEST.
    const thursday = at("2026-10-22T14:00:00Z");
    expect(stepDueAt("d1_test_set", { signed_up_at: thursday, first_report_at: null })!.toISOString()).toBe("2026-10-23T14:00:00.000Z");
    expect(stepDueAt("d3_run", { signed_up_at: thursday, first_report_at: null })!.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(stepDueAt("first_report", { signed_up_at: thursday, first_report_at: null })).toBeNull();
  });
});

describe("lifecycle decisions", () => {
  it("sends D0 to a new owner and nothing else on day zero", () => {
    const c = candidate({ signed_up_at: at("2026-10-07T08:00:00Z") });
    const plan = planCandidate(c, ALL, at("2026-10-07T08:05:00Z"));
    expect(plan.send?.step).toBe("d0_welcome");
    expect(plan.skips).toEqual([]);
  });

  it("stops each step on conversion", () => {
    const now = at("2026-10-14T09:00:00Z"); // Wednesday, D7 due
    const c = candidate({ recorded: { d0_welcome: { status: "sent", attempts: 1, updated_at: "2026-10-07T08:03:00Z" } } });
    expect(decideStep("d1_test_set", { ...c, has_test_set: true }, at("2026-10-08T09:00:00Z"))).toEqual({ action: "skip", reason: "converted" });
    // D3 falls on Saturday 10 Oct, so it is due on Monday 12 Oct at 09:00.
    expect(decideStep("d3_run", { ...c, has_run: true }, at("2026-10-10T09:00:00Z"))).toEqual({ action: "wait" });
    expect(decideStep("d3_run", { ...c, has_run: true }, at("2026-10-12T07:00:00Z"))).toEqual({ action: "skip", reason: "converted" });
    expect(decideStep("d7_report", { ...c, has_report: true }, now)).toEqual({ action: "skip", reason: "converted" });
    expect(decideStep("d7_report", c, now)).toMatchObject({ action: "send" });
    const reported = { ...c, has_report: true, first_report_at: at("2026-10-09T10:00:00Z") };
    expect(decideStep("first_report", { ...reported, shared: true }, at("2026-10-09T12:00:00Z"))).toEqual({ action: "skip", reason: "converted" });
    expect(decideStep("first_report", reported, at("2026-10-09T12:00:00Z"))).toMatchObject({ action: "send" });
    expect(decideStep("d21_rerun", { ...reported, runs_after_first_report: 1 }, at("2026-10-28T09:00:00Z"))).toEqual({ action: "skip", reason: "converted" });
    expect(decideStep("d21_rerun", c, at("2026-10-28T09:00:00Z"))).toEqual({ action: "skip", reason: "not_applicable" });
    expect(decideStep("d30_winback", { ...c, last_activity_at: at("2026-10-30T09:00:00Z") }, at("2026-11-06T09:00:00Z"))).toEqual({ action: "skip", reason: "active" });
    expect(decideStep("d30_winback", c, at("2026-11-06T09:00:00Z"))).toMatchObject({ action: "send" });
  });

  it("never sends a step late, and waits until it is due", () => {
    const c = candidate();
    expect(decideStep("d1_test_set", c, at("2026-10-07T20:00:00Z"))).toEqual({ action: "wait" });
    expect(decideStep("d0_welcome", c, at("2026-10-12T09:00:00Z"))).toEqual({ action: "skip", reason: "window_passed" });
    expect(decideStep("d1_test_set", c, at("2026-10-12T09:00:00Z"))).toEqual({ action: "skip", reason: "window_passed" });
    // Enabled late: D0 and D1 are skipped, D3 still goes out once.
    const plan = planCandidate(c, ALL, at("2026-10-12T09:00:00Z"));
    expect(plan.skips.map((skip) => skip.step)).toEqual(["d0_welcome", "d1_test_set"]);
    expect(plan.send?.step).toBe("d3_run");
  });

  it("deduplicates: a sent, skipped, failed or freshly claimed step is done", () => {
    const now = at("2026-10-08T09:00:00Z");
    for (const status of ["sent", "skipped", "failed"] as const) {
      expect(decideStep("d1_test_set", candidate({ recorded: { d1_test_set: { status, attempts: 1, updated_at: "2026-10-08T08:00:00Z" } } }), now)).toEqual({ action: "done" });
    }
    expect(decideStep("d1_test_set", candidate({ recorded: { d1_test_set: { status: "sending", attempts: 1, updated_at: "2026-10-08T08:55:00Z" } } }), now)).toEqual({ action: "done" });
    // A crashed claim is retried after 15 minutes, a failed send while attempts remain.
    expect(decideStep("d1_test_set", candidate({ recorded: { d1_test_set: { status: "sending", attempts: 1, updated_at: "2026-10-08T08:00:00Z" } } }), now)).toMatchObject({ action: "send" });
    expect(decideStep("d1_test_set", candidate({ recorded: { d1_test_set: { status: "retry", attempts: 2, updated_at: "2026-10-08T08:00:00Z" } } }), now)).toMatchObject({ action: "send" });
    expect(decideStep("d1_test_set", candidate({ recorded: { d1_test_set: { status: "retry", attempts: 3, updated_at: "2026-10-08T08:00:00Z" } } }), now)).toEqual({ action: "done" });
  });

  it("sends at most one lifecycle email per person per 20 hours, earliest due first", () => {
    const c = candidate({
      has_report: true, first_report_at: at("2026-10-09T08:00:00Z"),
      recorded: { d0_welcome: { status: "sent", attempts: 1, updated_at: "2026-10-07T08:03:00Z" }, d1_test_set: { status: "skipped", attempts: 0, updated_at: "2026-10-08T07:00:00Z" } },
    });
    // On Saturday 10 Oct both D3 (skipped: has a run? no) and first_report are candidates.
    const plan = planCandidate({ ...c, has_run: true }, ALL, at("2026-10-12T10:00:00Z"));
    expect(plan.send?.step).toBe("first_report");
    const recent = planCandidate({ ...c, has_run: true, last_sent_at: new Date(at("2026-10-12T10:00:00Z").getTime() - MIN_GAP_MS + 60_000) }, ALL, at("2026-10-12T10:00:00Z"));
    expect(recent.send).toBeNull();
  });

  it("only plans enabled steps (D0–D7 by default)", () => {
    expect([...lifecycleConfig({}).steps]).toEqual(["d0_welcome", "d1_test_set", "d3_run", "d7_report"]);
    expect(lifecycleConfig({}).enabled).toBe(false);
    expect(lifecycleConfig({ LIFECYCLE_EMAILS_ENABLED: "true", LIFECYCLE_EMAIL_STEPS: "all" }).steps.size).toBe(7);
    expect([...lifecycleConfig({ LIFECYCLE_EMAIL_STEPS: "first_report, d0_welcome" }).steps]).toEqual(["d0_welcome", "first_report"]);
    expect(() => lifecycleConfig({ LIFECYCLE_EMAIL_STEPS: "d2_nope" })).toThrow("lifecycle_email_steps_invalid");
    const reported = candidate({ has_report: true, first_report_at: at("2026-10-09T08:00:00Z") });
    // The first-report step is not in the default set: D1 (still in its window) goes out instead.
    expect(planCandidate(reported, lifecycleConfig({}).steps, at("2026-10-09T10:00:00Z")).send?.step).toBe("d1_test_set");
    expect(planCandidate(reported, new Set(["first_report" as const]), at("2026-10-09T10:00:00Z")).send?.step).toBe("first_report");
  });

  it("renders each step in the person's language with an unsubscribe link and the booking link", () => {
    const token = "b".repeat(64);
    const env = { EVALS_APP_URL: "https://app.caudals.com", CALCOM_LINK: "caudals/setup" };
    for (const step of LIFECYCLE_STEPS) {
      const email = renderLifecycleEmail(step, candidate({ locale: "es" }), token, env);
      expect(email.locale).toBe("es");
      expect(email.text).toContain(`https://app.caudals.com/workspace/unsubscribe#${token}`);
      expect(email.headers?.["List-Unsubscribe"]).toBe(`<https://app.caudals.com/api/evals/v1/email/unsubscribe?token=${token}>`);
    }
    expect(renderLifecycleEmail("d7_report", candidate(), token, env).text).toContain("https://cal.com/caudals/setup");
  });
});
