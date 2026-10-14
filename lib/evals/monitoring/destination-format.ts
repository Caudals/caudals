/**
 * Messages for Slack, Microsoft Teams and email destinations (launch L-19,
 * spec v2 P-25, P-28). A scheduled run's summary (./summary.ts) becomes one
 * channel-neutral message in the destination's language (`buildDestinationMessage`),
 * then a Slack Block Kit payload, a Teams Adaptive Card or the branded
 * `monitor_summary` email. The wording is the email catalogue's
 * (lib/email/copy.ts → monitorSummary), so the three read the same in EN and ES.
 *
 * Links open the run's report (each newly broken question opens its answer)
 * or, without a report, the evaluation. Titles are customer text: they are
 * escaped for each format and cut to a safe length.
 *
 * Pure: no network, no database, no "server-only" (the scheduler and tests use it).
 */
import { emailCopy, fill, type EmailLocale } from "@/lib/email/copy";
import type { MonitoringSummary, Score } from "./summary";

export type DestinationMessage = {
  /** Subject line and heading. */
  title: string;
  preview: string;
  lead: string;
  facts: Array<{ label: string; value: string }>;
  brokenIntro: string;
  broken: Array<{ title: string; url: string }>;
  /** "And N more in the report." */
  more: string | null;
  fixed: string | null;
  action: { label: string; url: string };
  /** Small print: Caudals, the workspace and the run's date. */
  context: string;
  /** Email footer: why this address receives it. */
  footer: string;
  /** Set on a test send: the example is labelled as one. */
  test: { subject: string; heading: string; lead: string; note: string } | null;
};

export type MessageOptions = { locale: EmailLocale; appUrl: string; orgId: string; workspace: string; test?: boolean };
/** What a destination is sent, before its language is applied: a run's summary, or the test send's example. */
export type DestinationContent = { appUrl: string; orgId: string; workspace: string } & ({ summary: MonitoringSummary } | { test: true; now?: string });

/** The message for one destination in its language. */
export function destinationMessage(content: DestinationContent, locale: EmailLocale): DestinationMessage {
  const options = { locale, appUrl: content.appUrl, orgId: content.orgId, workspace: content.workspace };
  return "summary" in content ? buildDestinationMessage(content.summary, options) : testMessage(options, content.now ? new Date(content.now) : undefined);
}

const TITLE_LIMIT = 150;
const intlLocale = (locale: EmailLocale) => (locale === "es" ? "es-ES" : "en-GB");
const cut = (value: string, limit = TITLE_LIMIT) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const integer = (locale: EmailLocale, value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
const percent = (locale: EmailLocale, score: Score) =>
  score.scored > 0 ? new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(score.pass / score.scored) : "—";
const day = (locale: EmailLocale, iso: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso));

/** Absolute links into the app for one workspace. */
export function destinationLinks(appUrl: string, orgId: string) {
  const base = appUrl.replace(/\/$/, ""), org = encodeURIComponent(orgId);
  return {
    report: (reportId: string) => `${base}/workspace/reports/${encodeURIComponent(reportId)}?orgId=${org}`,
    answer: (reportId: string, assessmentId: string) => `${base}/workspace/reports/${encodeURIComponent(reportId)}?orgId=${org}&result=${encodeURIComponent(assessmentId)}`,
    evaluation: (evaluationId: string) => `${base}/workspace/evaluations/${encodeURIComponent(evaluationId)}?orgId=${org}`,
    evaluations: `${base}/workspace/evaluations?orgId=${org}`,
  };
}

export function buildDestinationMessage(summary: MonitoringSummary, options: MessageOptions): DestinationMessage {
  const c = emailCopy(options.locale), k = c.monitorSummary, locale = options.locale;
  const links = destinationLinks(options.appUrl, options.orgId);
  const evaluation = cut(summary.evaluation.title || k.testEvaluation, 120);
  const date = day(locale, summary.scheduledFor);
  const values = { evaluation, date, count: integer(locale, summary.newlyBrokenTotal), now: percent(locale, summary.candidate.score), workspace: options.workspace };
  const title = summary.status === "regression"
    ? fill(summary.newlyBrokenTotal === 1 ? k.subjectRegressionOne : k.subjectRegression, values)
    : summary.status === "pass" ? fill(k.subjectPass, values)
      : summary.status === "unknown" ? fill(k.subjectUnknown, values) : fill(k.subjectInconclusive, values);
  const lead = summary.status === "regression" ? k.leadRegression
    : summary.status === "pass" ? k.leadPass
      : summary.status === "unknown" ? k.leadUnknown
        : !summary.baseline ? k.leadFirst
          : !summary.comparable ? k.leadNotComparable
            : summary.reasons.includes("mixed_change") ? k.leadMixed : k.leadIncomplete;
  const score = (value: Score) => fill(k.scoreValue, { percent: percent(locale, value), pass: integer(locale, value.pass), scored: integer(locale, value.scored) });
  const facts = summary.status === "unknown" || !summary.candidate.score.scored ? [] : [
    { label: k.scoreNow, value: score(summary.candidate.score) },
    ...(summary.baseline && summary.comparable ? [{ label: k.scoreBefore, value: score(summary.baseline.score) }] : []),
  ];
  const reportId = summary.candidate.reportId;
  const broken = summary.comparable ? summary.newlyBroken.slice(0, 5).map(item => ({
    title: cut(item.title || "—"),
    url: reportId && item.assessmentId ? links.answer(reportId, item.assessmentId) : reportId ? links.report(reportId) : links.evaluation(summary.evaluation.id),
  })) : [];
  const moreCount = summary.comparable ? summary.newlyBrokenTotal - broken.length : 0;
  const action = reportId && summary.status !== "unknown"
    ? { label: k.actionReport, url: links.report(reportId) }
    : options.test ? { label: k.actionEvaluation, url: links.evaluations } : { label: k.actionEvaluation, url: links.evaluation(summary.evaluation.id) };
  return {
    title, preview: fill(k.preview, values), lead: fill(lead, values), facts,
    brokenIntro: k.brokenIntro, broken,
    more: moreCount > 0 ? fill(k.brokenMore, { count: integer(locale, moreCount) }) : null,
    fixed: summary.comparable && summary.fixedTotal > 0 ? (summary.fixedTotal === 1 ? k.fixedOne : fill(k.fixed, { count: integer(locale, summary.fixedTotal) })) : null,
    action, context: fill(k.context, values), footer: fill(c.footer.destination, { workspace: options.workspace }),
    test: options.test ? { subject: k.testSubject, heading: k.testHeading, lead: fill(k.testLead, { workspace: options.workspace }), note: k.testNote } : null,
  };
}

/**
 * The example a test send shows: a regression with two newly broken questions,
 * so the destination sees every part of a real alert. Its links open the
 * workspace's evaluations (nothing real is referenced).
 */
export function sampleSummary(locale: EmailLocale, now: Date = new Date()): MonitoringSummary {
  const k = emailCopy(locale).monitorSummary;
  return {
    version: 1, status: "regression", comparable: true, reasons: ["paired_case_regressed"],
    evaluation: { id: "example", title: k.testEvaluation }, scheduleId: "example", dispatchId: "example", scheduledFor: now.toISOString(),
    candidate: { runId: "example", reportId: null, score: { pass: 16, scored: 20 } },
    baseline: { runId: "example-before", reportId: null, score: { pass: 18, scored: 20 } },
    newlyBroken: k.testQuestions.map((title, index) => ({ caseRevisionId: `example-${index}`, title, severity: index === 0 ? "high" : "medium", before: "pass", after: "fail", assessmentId: null, baselineAssessmentId: null })),
    newlyBrokenTotal: 2, fixedTotal: 0,
  };
}

/** The example's links all open the workspace's evaluations. */
export function testMessage(options: Omit<MessageOptions, "test">, now: Date = new Date()): DestinationMessage {
  const message = buildDestinationMessage(sampleSummary(options.locale, now), { ...options, test: true });
  const evaluations = destinationLinks(options.appUrl, options.orgId).evaluations;
  return { ...message, broken: message.broken.map(item => ({ ...item, url: evaluations })), action: { ...message.action, url: evaluations } };
}

/* ---------------------------------------------------------------- Slack --- */

/** Slack mrkdwn: escape the three control characters; link labels also lose `|`. */
const slackText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slackLink = (url: string, label: string) => `<${url}|${slackText(label).replace(/\|/g, "¦")}>`;
const plain = (value: string, limit: number) => cut(value, limit);

/** A Slack incoming-webhook payload (Block Kit) with a plain-text fallback. */
export function slackPayload(message: DestinationMessage) {
  const heading = message.test ? message.test.heading : message.title;
  const blocks: Array<Record<string, unknown>> = [{ type: "header", text: { type: "plain_text", text: plain(heading, 150), emoji: false } }];
  if (message.test) blocks.push({ type: "section", text: { type: "mrkdwn", text: `${slackText(message.test.lead)}\n_${slackText(message.test.note)}_` } }, { type: "divider" });
  if (message.test) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${slackText(message.title)}*` } });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: slackText(message.lead) } });
  if (message.facts.length) blocks.push({ type: "section", fields: message.facts.map(fact => ({ type: "mrkdwn", text: `*${slackText(fact.label)}*\n${slackText(fact.value)}` })) });
  if (message.broken.length) {
    const lines = message.broken.map(item => `• ${slackLink(item.url, item.title)}`);
    if (message.more) lines.push(`_${slackText(message.more)}_`);
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${slackText(message.brokenIntro)}*\n${lines.join("\n")}` } });
  }
  if (message.fixed) blocks.push({ type: "section", text: { type: "mrkdwn", text: slackText(message.fixed) } });
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: plain(message.action.label, 75), emoji: false }, url: message.action.url }] });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: slackText(message.context) }] });
  return { text: message.test ? `${message.test.heading}: ${message.title}` : message.title, blocks, unfurl_links: false, unfurl_media: false };
}

/* ---------------------------------------------------------------- Teams --- */

/** Adaptive Card markdown: square brackets would open a link. */
const teamsText = (value: string) => value.replace(/\[/g, "(").replace(/\]/g, ")");

/** A Teams incoming-webhook (Workflows) payload: one Adaptive Card 1.4. */
export function teamsPayload(message: DestinationMessage) {
  const body: Array<Record<string, unknown>> = [];
  if (message.test) {
    body.push({ type: "TextBlock", text: teamsText(message.test.heading), weight: "Bolder", size: "Large", wrap: true },
      { type: "TextBlock", text: teamsText(message.test.lead), wrap: true },
      { type: "TextBlock", text: teamsText(message.test.note), isSubtle: true, wrap: true, spacing: "None" });
  }
  body.push({ type: "TextBlock", text: teamsText(message.title), weight: "Bolder", size: message.test ? "Medium" : "Large", wrap: true, ...(message.test ? { separator: true, spacing: "Medium" } : {}) },
    { type: "TextBlock", text: teamsText(message.lead), wrap: true });
  if (message.facts.length) body.push({ type: "FactSet", facts: message.facts.map(fact => ({ title: teamsText(fact.label), value: teamsText(fact.value) })) });
  if (message.broken.length) {
    body.push({ type: "TextBlock", text: teamsText(message.brokenIntro), weight: "Bolder", wrap: true, spacing: "Medium" },
      { type: "TextBlock", text: message.broken.map(item => `- [${teamsText(item.title)}](${item.url})`).join("\n"), wrap: true, spacing: "Small" });
    if (message.more) body.push({ type: "TextBlock", text: teamsText(message.more), isSubtle: true, wrap: true, spacing: "Small" });
  }
  if (message.fixed) body.push({ type: "TextBlock", text: teamsText(message.fixed), wrap: true });
  body.push({ type: "TextBlock", text: teamsText(message.context), isSubtle: true, size: "Small", wrap: true, spacing: "Medium" });
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
        body, actions: [{ type: "Action.OpenUrl", title: message.action.label, url: message.action.url }], msteams: { width: "Full" },
      },
    }],
  };
}
