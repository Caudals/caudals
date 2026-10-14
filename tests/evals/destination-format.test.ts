/**
 * Launch L-19 (spec v2 P-25, P-28): the Slack, Microsoft Teams and email
 * messages for a scheduled run's summary. Snapshots fix what each channel
 * receives in EN and ES; the structural checks keep them valid for Slack's
 * Block Kit and Teams' Adaptive Cards (sizes, link syntax, escaping).
 */
import { describe, expect, it } from "vitest";
import { buildDestinationMessage, sampleSummary, slackPayload, teamsPayload, testMessage } from "@/lib/evals/monitoring/destination-format";
import type { MonitoringSummary } from "@/lib/evals/monitoring/summary";
import { renderEmail } from "@/lib/email/templates";

const orgId = "00000000-0000-4000-8000-000000000001";
const base = { appUrl: "https://app.caudals.com", orgId, workspace: "Acme Support" };
const at = "2026-10-01T07:00:00.000Z";

function summary(overrides: Partial<MonitoringSummary> = {}): MonitoringSummary {
  return {
    version: 1, status: "regression", comparable: true, reasons: ["paired_case_regressed"],
    evaluation: { id: "eval-1", title: "Support assistant" }, scheduleId: "sched-1", dispatchId: "disp-1", scheduledFor: at,
    candidate: { runId: "run-2", reportId: "report-2", score: { pass: 7, scored: 10 } },
    baseline: { runId: "run-1", reportId: "report-1", score: { pass: 9, scored: 10 } },
    newlyBroken: [
      { caseRevisionId: "c1", title: "Refund window for <sale> items & returns", severity: "critical", before: "pass", after: "fail", assessmentId: "a1", baselineAssessmentId: "b1" },
      { caseRevisionId: "c2", title: "Delivery [express] | same day", severity: "medium", before: "pass", after: "partial", assessmentId: "a2", baselineAssessmentId: "b2" },
    ],
    newlyBrokenTotal: 7, fixedTotal: 1,
    ...overrides,
  };
}

const cases: Array<[string, MonitoringSummary]> = [
  ["regression", summary()],
  ["pass", summary({ status: "pass", reasons: [], newlyBroken: [], newlyBrokenTotal: 0, fixedTotal: 0, candidate: { runId: "run-2", reportId: "report-2", score: { pass: 9, scored: 10 } } })],
  ["first run", summary({ status: "inconclusive", reasons: ["no_baseline"], comparable: false, baseline: null, newlyBroken: [], newlyBrokenTotal: 0, fixedTotal: 0 })],
  ["not comparable", summary({ status: "inconclusive", reasons: ["suite_changed"], comparable: false })],
  ["unknown", summary({ status: "unknown", reasons: ["run_failed"], comparable: false, candidate: { runId: "run-2", reportId: null, score: { pass: 0, scored: 0 } }, newlyBroken: [], newlyBrokenTotal: 0, fixedTotal: 0 })],
];

describe("destination messages (launch L-19)", () => {
  for (const locale of ["en", "es"] as const) {
    for (const [name, value] of cases) {
      it(`Slack and Teams payloads: ${name} (${locale})`, () => {
        const message = buildDestinationMessage(value, { ...base, locale });
        expect(slackPayload(message)).toMatchSnapshot("slack");
        expect(teamsPayload(message)).toMatchSnapshot("teams");
      });
    }
    it(`the test message is labelled as an example (${locale})`, () => {
      const message = testMessage({ ...base, locale }, new Date(at));
      expect(message.test).not.toBeNull();
      expect(slackPayload(message)).toMatchSnapshot("slack test");
      expect(teamsPayload(message)).toMatchSnapshot("teams test");
      // Every link of the example opens the workspace's evaluations, never a made-up report.
      const links = [message.action.url, ...message.broken.map(item => item.url)];
      expect(new Set(links)).toEqual(new Set([`https://app.caudals.com/workspace/evaluations?orgId=${orgId}`]));
      const email = renderEmail("monitor_summary", locale, { ...base, test: true, now: at });
      expect(email.subject).toBe(locale === "es" ? "Mensaje de prueba de Caudals" : "Test message from Caudals");
      expect(email.text).toMatchSnapshot("email test text");
    });
  }

  it("links each newly broken question to its answer in the report, at most five", () => {
    const many = summary({ newlyBroken: Array.from({ length: 7 }, (_, index) => ({ caseRevisionId: `c${index}`, title: `Question ${index}`, severity: "high", before: "pass" as const, after: "fail" as const, assessmentId: `a${index}`, baselineAssessmentId: null })) });
    const message = buildDestinationMessage(many, { ...base, locale: "en" });
    expect(message.broken).toHaveLength(5);
    expect(message.broken[0].url).toBe(`https://app.caudals.com/workspace/reports/report-2?orgId=${orgId}&result=a0`);
    expect(message.more).toBe("And 2 more in the report.");
    expect(message.action).toEqual({ label: "Open the report", url: `https://app.caudals.com/workspace/reports/report-2?orgId=${orgId}` });
    expect(message.title).toBe("Support assistant: 7 questions got worse since the last run");
    expect(message.facts).toEqual([{ label: "Score this run", value: "70% (7 of 10 correct)" }, { label: "Score last time", value: "90% (9 of 10 correct)" }]);
  });

  it("escapes customer text for Slack mrkdwn and Teams markdown and keeps within Block Kit limits", () => {
    const long = summary({ evaluation: { id: "e", title: "E".repeat(400) } });
    const slack = slackPayload(buildDestinationMessage(long, { ...base, locale: "en" }));
    const blocks = slack.blocks as Array<Record<string, any>>;
    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text.length).toBeLessThanOrEqual(150);
    for (const block of blocks) if (block.type === "section" && block.text) expect(block.text.text.length).toBeLessThanOrEqual(3000);
    const list = blocks.find(block => block.type === "section" && String(block.text?.text).includes("now fail"))!.text.text as string;
    expect(list).toContain("Refund window for &lt;sale&gt; items &amp; returns>");
    expect(list).toContain("|Delivery [express] ¦ same day>");
    expect(list).not.toMatch(/<sale>/);
    const teams = JSON.stringify(teamsPayload(buildDestinationMessage(summary(), { ...base, locale: "en" })));
    expect(teams).toContain("[Delivery (express) | same day](https://app.caudals.com/workspace/reports/report-2?orgId=");
    expect(teamsPayload(buildDestinationMessage(summary(), { ...base, locale: "en" })).attachments[0].content.version).toBe("1.4");
  });

  it("says when runs cannot be compared, and never lists questions then", () => {
    const message = buildDestinationMessage(cases[3][1], { ...base, locale: "en" });
    expect(message.lead).toContain("cannot be compared with the last run");
    expect(message.broken).toEqual([]);
    expect(message.facts.map(fact => fact.label)).toEqual(["Score this run"]);
  });

  it("renders the email destination in both languages with its own footer", () => {
    for (const locale of ["en", "es"] as const) {
      const email = renderEmail("monitor_summary", locale, { ...base, summary: summary() });
      // Sent to a shared address, not a member: its own footer instead of a member's settings link.
      expect(email.category).toBe("essential");
      expect(email.subject).toBe(locale === "es" ? "Support assistant: 7 preguntas han empeorado desde la última ejecución" : "Support assistant: 7 questions got worse since the last run");
      expect(email.text).toContain(locale === "es" ? "Ajustes → Desarrolladores" : "Settings → Developers");
      expect(email.html).toContain(`report-2?orgId=${orgId}&amp;result=a1`);
      expect(email.text).toMatchSnapshot(`email text ${locale}`);
    }
  });

  it("the sample summary has the shape of a real one", () => {
    const sample = sampleSummary("es", new Date(at));
    expect(sample.newlyBroken).toHaveLength(2);
    expect(sample.newlyBrokenTotal).toBe(2);
    expect(sample.status).toBe("regression");
  });
});
