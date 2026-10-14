/**
 * Launch L-18 units: the monthly projection shown with a schedule's estimate,
 * the regression summary (score against last time, newly broken questions,
 * "not comparable"), the regression and skipped-run emails in English and
 * Spanish, and the Spanish catalogue for every new interface string.
 */
import { describe, expect, it } from "vitest";
import { monthlyProjection, runsPerMonth } from "../../lib/evals/monitoring/projection";
import { latestDueSlot, nextScheduleSlot } from "../../lib/evals/monitoring/calendar";
import { ALERT_BROKEN_LIMIT, buildMonitoringSummary, changedQuestions, scoreOf, type OutcomeRow } from "../../lib/evals/monitoring/summary";
import { renderEmail } from "../../lib/email/templates";
import { messages } from "../../lib/evals/messages/en";
import { es } from "../../lib/evals/messages/es";
import { composeBranded, regressionEmailProps } from "../../lib/evals/operations/notifications";
import { noticePayload } from "../../lib/evals/monitoring/destinations";

const row = (id: string, outcome: OutcomeRow["outcome"], severity = "medium", title = `Question ${id}`): OutcomeRow => ({ caseRevisionId: id, title, severity, outcome, assessmentId: `a-${id}` });
const ORG = "00000000-0000-4000-8000-000000000001";

describe("schedule estimate: monthly projection (§6.7)", () => {
  it("projects per-run credits over the runs a cadence makes in a month", () => {
    expect(runsPerMonth("monthly")).toEqual({ min: 1, max: 1 });
    expect(runsPerMonth("weekly")).toEqual({ min: 4, max: 5 });
    expect(runsPerMonth("daily")).toEqual({ min: 28, max: 31 });
    expect(monthlyProjection("monthly", { p50: 270, p90: 340 })).toEqual({ runs: { min: 1, max: 1 }, low: 270, high: 340 });
    expect(monthlyProjection("weekly", { p50: 270, p90: 340 })).toEqual({ runs: { min: 4, max: 5 }, low: 1080, high: 1700 });
    expect(monthlyProjection("weekly", { p50: 0.4, p90: 0.6 })).toEqual({ runs: { min: 4, max: 5 }, low: 2, high: 3 });
  });
});

describe("monthly and weekly slots keep the DST and catch-up rules (P-24)", () => {
  it("skips a monthly slot that falls in the spring gap and runs a weekly one once in the autumn fold", () => {
    // 29 March 2026, 02:30 in Madrid does not exist (clocks go from 02:00 to 03:00): that month is skipped.
    const monthly = { timezone: "Europe/Madrid", cadence: "monthly" as const, localTime: "02:30", weekday: null, dayOfMonth: 29 };
    expect(nextScheduleSlot(monthly, "2026-03-01T00:00:00Z")).toEqual({ localSlotKey: "2026-04-29T02:30", scheduledFor: "2026-04-29T00:30:00.000Z" });
    // 25 October 2026, 02:30 happens twice: the first occurrence (CEST) runs, once.
    const weekly = { timezone: "Europe/Madrid", cadence: "weekly" as const, localTime: "02:30", weekday: 7, dayOfMonth: null };
    const fold = nextScheduleSlot(weekly, "2026-10-20T00:00:00Z");
    expect(fold).toEqual({ localSlotKey: "2026-10-25T02:30", scheduledFor: "2026-10-25T00:30:00.000Z" });
    expect(nextScheduleSlot(weekly, "2026-10-25T01:00:00Z", fold.localSlotKey).localSlotKey).toBe("2026-11-01T02:30");
  });
  it("after downtime runs only the latest missed monthly slot", () => {
    const monthly = { timezone: "Europe/Madrid", cadence: "monthly" as const, localTime: "09:00", weekday: null, dayOfMonth: 1 };
    const caught = latestDueSlot(monthly, "2026-06-01T07:00:00.000Z", "2026-09-01T08:00:00.000Z");
    expect(caught.latest?.localSlotKey).toBe("2026-09-01T09:00");
    expect(caught.missedCount).toBe(3);
    expect(caught.next.localSlotKey).toBe("2026-10-01T09:00");
  });
});

describe("regression summary (P-25)", () => {
  const baseline = [row("1", "pass", "low"), row("2", "pass", "critical"), row("3", "partial"), row("4", "fail"), row("5", "pass"), row("6", "unscorable"), row("7", "pass", "high")];
  const candidate = [row("1", "fail", "low"), row("2", "partial", "critical"), row("3", "fail"), row("4", "pass"), row("5", "pass"), row("6", "fail"), row("7", "fail", "high")];

  it("lists newly broken and fixed questions, most severe first, and never pairs unscored answers", () => {
    const { broken, fixed } = changedQuestions(baseline, candidate);
    expect(broken.map(item => [item.caseRevisionId, item.before, item.after])).toEqual([["2", "pass", "partial"], ["7", "pass", "fail"], ["3", "partial", "fail"], ["1", "pass", "fail"]]);
    expect(fixed.map(item => item.caseRevisionId)).toEqual(["4"]);
    expect(broken.find(item => item.caseRevisionId === "6")).toBeUndefined();
    expect(scoreOf(baseline)).toEqual({ pass: 4, scored: 6 });
    expect(scoreOf(candidate)).toEqual({ pass: 2, scored: 7 });
  });

  it("keeps at most five newly broken questions with the full count", () => {
    const before = Array.from({ length: 8 }, (_, index) => row(String(index), "pass"));
    const after = Array.from({ length: 8 }, (_, index) => row(String(index), "fail"));
    const summary = buildMonitoringSummary({ status: "regression", reasons: ["paired_case_regressed"], compatible: true, evaluation: { id: "e", title: "Claims" },
      scheduleId: "s", dispatchId: "d", scheduledFor: "2026-11-02T08:00:00.000Z",
      candidate: { runId: "r2", reportId: "rep2", rows: after }, baseline: { runId: "r1", reportId: "rep1", rows: before } });
    expect(summary.newlyBroken).toHaveLength(ALERT_BROKEN_LIMIT);
    expect(summary.newlyBrokenTotal).toBe(8);
    expect(summary).toMatchObject({ comparable: true, candidate: { score: { pass: 0, scored: 8 } }, baseline: { score: { pass: 8, scored: 8 } } });
  });

  it("says 'not comparable' and lists nothing when the runs differ, or there is no earlier run", () => {
    const changedSuite = buildMonitoringSummary({ status: "inconclusive", reasons: ["suite_changed"], compatible: false, evaluation: { id: "e", title: "Claims" },
      scheduleId: "s", dispatchId: "d", scheduledFor: "2026-11-02T08:00:00.000Z",
      candidate: { runId: "r2", reportId: null, rows: candidate }, baseline: { runId: "r1", reportId: null, rows: baseline } });
    expect(changedSuite).toMatchObject({ comparable: false, reasons: ["suite_changed"], newlyBroken: [], newlyBrokenTotal: 0, fixedTotal: 0 });
    const first = buildMonitoringSummary({ status: "inconclusive", reasons: ["no_baseline"], compatible: null, evaluation: { id: "e", title: "Claims" },
      scheduleId: "s", dispatchId: "d", scheduledFor: "2026-11-02T08:00:00.000Z", candidate: { runId: "r1", reportId: null, rows: candidate }, baseline: null });
    expect(first).toMatchObject({ comparable: false, baseline: null, newlyBroken: [] });
    // The in-app notice carries the same facts, compactly.
    const notice = noticePayload({ orgId: ORG, alertId: "alert", eventId: "monitor:d:inconclusive", summary: changedSuite, webhookEvent: "inconclusive", webhookPayload: {} });
    expect(notice).toMatchObject({ status: "inconclusive", comparable: false, brokenTotal: 0, broken: [], pass: 2, scored: 7, previousPass: 4, previousScored: 6 });
  });
});

describe("regression email (L-07 template, P-25)", () => {
  const summary = buildMonitoringSummary({ status: "regression", reasons: ["paired_case_regressed"], compatible: true, evaluation: { id: "e1", title: "Claims assistant" },
    scheduleId: "s", dispatchId: "d", scheduledFor: "2026-11-02T08:00:00.000Z",
    candidate: { runId: "r2", reportId: "00000000-0000-4000-8000-000000000301", rows: [row("1", "fail", "critical", "Management fee"), row("2", "pass"), row("3", "partial", "low", "Custody fee")] },
    baseline: { runId: "r1", reportId: "00000000-0000-4000-8000-000000000300", rows: [row("1", "pass", "critical", "Management fee"), row("2", "pass"), row("3", "pass", "low", "Custody fee")] } });
  const payload = noticePayload({ orgId: ORG, alertId: "alert", eventId: "monitor:d:regression", summary, webhookEvent: "regression", webhookPayload: {} });

  it("shows the score against last time and the newly broken questions, each linking to its answer", () => {
    const props = regressionEmailProps(payload, ORG);
    expect(props.broken.map(item => item.title)).toEqual(["Management fee", "Custody fee"]);
    expect(props.broken[0].url).toBe(`https://app.caudals.com/workspace/reports/00000000-0000-4000-8000-000000000301?orgId=${ORG}&result=a-1`);
    const en = composeBranded("monitor_regression", payload, ORG, "en");
    expect(en.subject).toBe("Claims assistant: 2 questions got worse since the last run");
    expect(en.text).toContain("Score this run: 33% (1 of 3 correct)");
    expect(en.text).toContain("Score last time: 100% (3 of 3 correct)");
    expect(en.text).toContain("Management fee:\nhttps://app.caudals.com/workspace/reports/");
    expect(en.html).toContain("result=a-1");
    const es = composeBranded("monitor_regression", payload, ORG, "es");
    expect(es.subject).toBe("Claims assistant: 2 preguntas han empeorado desde la última ejecución");
    expect(es.text).toContain("Preguntas que funcionaban la última vez y ahora fallan:");
    expect(es.html).toContain('lang="es"');
  });

  it("names the remaining count beyond five questions", () => {
    const email = renderEmail("monitor_regression", "en", { evaluation: "Claims", scheduledFor: "2026-11-02T08:00:00Z", now: { pass: 1, scored: 10 }, before: { pass: 9, scored: 10 },
      broken: Array.from({ length: 7 }, (_, index) => ({ title: `Q${index}`, url: `https://app.caudals.com/q${index}` })), brokenTotal: 8,
      reportUrl: "https://app.caudals.com/r", settingsUrl: "https://app.caudals.com/s" });
    expect(email.text.match(/https:\/\/app\.caudals\.com\/q\d/g)).toHaveLength(5);
    expect(email.text).toContain("And 3 more in the report.");
  });
});

describe("skipped-run email (P-24, §6.10)", () => {
  it("says why the run was skipped and what to do before the next one, in English and Spanish", () => {
    const base = { workspace: "Acme", evaluation: "Claims assistant", scheduledFor: "2026-11-02T08:00:00Z", needed: 340, available: 120, nextRunAt: "2026-12-07T08:00:00Z",
      actionUrl: "https://app.caudals.com/workspace/settings?tab=billing&view=top-up", settingsUrl: "https://app.caudals.com/workspace/settings?tab=notifications" };
    const credits = renderEmail("schedule_skipped", "en", { ...base, reason: "credits" });
    expect(credits.subject).toBe("A scheduled Caudals run was skipped: not enough credits");
    expect(credits.text).toContain("it needs about 340 credits and Acme has 120. Nothing was charged.");
    expect(credits.text).toContain("The next run is on 7 December 2026. Add credits before then so it goes ahead.");
    expect(credits.text).toContain("Add credits:\nhttps://app.caudals.com/workspace/settings?tab=billing&view=top-up");
    const cap = renderEmail("schedule_skipped", "es", { ...base, reason: "cap", capScope: "schedule", cap: 300 });
    expect(cap.subject).toBe("Se ha omitido una ejecución programada de Caudals: se ha alcanzado el límite de créditos");
    expect(cap.text).toContain("superaría el límite por programación de 300 créditos");
    expect(cap.text).toContain("Sube el límite antes o también se omitirá.");
  });
});

describe("interface strings (EN/ES)", () => {
  it("translates every launch L-18 string", () => {
    const keys = Object.keys(messages).filter(key => /^(schedule(Estimate|Credit|Cap|Edit|Reason)|monitor(Score|NewlyBroken|NotComparable|FirstRun|Details)|noticeScheduleSkipped|noticeCapSchedule|noticeMonitor(Unknown|Score|NotComparable|BrokenList)|comparison|rerun)/.test(key));
    expect(keys.length).toBeGreaterThan(60);
    const missing = keys.filter(key => !(es as Record<string, string | undefined>)[key]?.trim());
    expect(missing).toEqual([]);
  });
});
