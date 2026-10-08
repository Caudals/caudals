/**
 * The client-facing report document (PDF). Rendered from the same immutable
 * snapshot as the web report, by the document worker, from trusted server-side
 * HTML only: every value from the snapshot is escaped, no script runs, and all
 * charts are plain HTML/SVG so the text stays selectable.
 *
 * Structure (spec §15.2): summary and headline metrics with denominators →
 * results at a glance → findings → improvements → test results → interaction
 * evidence → methodology, limitations and identifiers.
 */
import type { ReportSnapshot } from "./contracts";
import { GEIST_MONO_WOFF2, GEIST_WOFF2 } from "./fonts";
import { localizeReportText, reportDate, reportLabel, reportStrings, type ReportLocale } from "./i18n";

type Result = ReportSnapshot["results"][number];
const SEVERITY = ["critical", "high", "medium", "low"] as const;
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const LABEL: Record<string, string> = {
  correct: "Correct", partially_correct: "Partly correct", incorrect: "Incorrect", not_answered: "No answer",
  test_issue: "Test needs review", capture_issue: "Not captured", not_run: "Not run", pending: "Not scored",
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
  unscorable: "Not scored",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  preliminary: "Preliminary",
  reviewed: "Reviewed",
  complete: "Complete",
  incomplete: "Incomplete",
  deployed_system: "Deployed system",
  controlled_model: "Controlled model",
  imported_responses: "Imported answers",
  exploratory: "Exploratory",
  source_grounded: "Source-grounded",
  proposed: "Proposed",
  planned: "Planned",
  in_progress: "In progress",
  validated: "Validated",
  closed: "Closed",
};
const TONE: Record<string, string> = { pass: "pass", partial: "warn", fail: "fail", unscorable: "neutral", correct: "pass", partially_correct: "warn", incorrect: "fail", not_answered: "fail", test_issue: "neutral", capture_issue: "neutral", not_run: "neutral", pending: "neutral", critical: "fail", high: "fail", medium: "warn", low: "neutral" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
// The language of the document being rendered. Rendering is synchronous, so
// setting it at the start of renderReportDocument is safe.
let locale: ReportLocale = "en";
let S = reportStrings("en");
const tx = (text: string) => localizeReportText(text, locale);
const plain = (value: string) => reportLabel(LABEL[value] ?? value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()), locale);
const label = (value: string) => escapeHtml(plain(value));
const pct = (value: number | null | undefined, digits = 0) => (value == null ? "—" : `${(value * 100).toFixed(digits)}%`);
const day = (value: string) => escapeHtml(reportDate(value, locale));
const chip = (value: string, tone = TONE[value] ?? "neutral") => `<span class="chip" data-tone="${tone}">${label(value)}</span>`;
const LOGO = `<svg class="mark" viewBox="0 0 1080 1080" aria-hidden="true"><path d="M77 221.441C77 199.892 99.045 185.37 118.844 193.877L304.477 273.638C315.493 278.372 322.633 289.211 322.633 301.202V752.494C322.633 764.484 315.493 775.323 304.477 780.056L118.844 859.818C99.045 868.325 77 853.804 77 832.254V221.441Z"/><path d="M417.621 129.676C417.621 106.723 442.348 92.272 462.347 103.538L647.979 208.115C657.415 213.432 663.254 223.422 663.254 234.253V842.707C663.254 853.538 657.415 863.529 647.979 868.845L462.347 973.421C442.348 984.687 417.621 970.237 417.621 947.283V129.676Z"/><path d="M758.242 45.05C758.242 21.006 785.112 6.732 805.036 20.192L990.668 145.597C998.926 151.176 1003.87 160.49 1003.87 170.456V910.272C1003.87 920.238 998.926 929.553 990.668 935.131L805.036 1060.54C785.112 1074 758.242 1059.72 758.242 1035.68V45.05Z"/></svg>`;

function outcomeBar(counts: Record<"pass" | "partial" | "fail" | "unscorable", number>) {
  const total = counts.pass + counts.partial + counts.fail + counts.unscorable;
  const order = ["pass", "partial", "fail", "unscorable"] as const;
  const segments = total
    ? order.filter((key) => counts[key]).map((key) => `<span data-tone="${TONE[key]}" style="width:${((counts[key] / total) * 100).toFixed(3)}%"></span>`).join("")
    : `<span data-tone="empty" style="width:100%"></span>`;
  const legend = order.map((key) => `<li><i data-tone="${TONE[key]}"></i>${plain(key)} <b>${counts[key]}</b></li>`).join("");
  return `<div class="bar" role="img" aria-label="${order.map((key) => `${counts[key]} ${plain(key).toLowerCase()}`).join(", ")}">${segments}</div><ul class="legend">${legend}</ul>`;
}

function rateRows(rows: Array<{ label: string; pass: number; total: number }>) {
  return `<table class="rates">${rows
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.label)}</th><td class="track"><span style="width:${row.total ? ((row.pass / row.total) * 100).toFixed(2) : 0}%"></span></td><td class="num">${row.total ? pct(row.pass / row.total) : "—"}</td><td class="den">${row.pass}/${row.total}</td></tr>`,
    )
    .join("")}</table>`;
}

function bySeverity<T extends { severity: string }>(items: T[]) {
  return [...items].sort((a, b) => SEVERITY.indexOf(a.severity as never) - SEVERITY.indexOf(b.severity as never));
}

function pre(value: string) {
  return `<pre>${escapeHtml(value)}</pre>`;
}

/**
 * `hidden` names report sections a private share did not allow (see
 * ./share-sections.ts); they are left out of the document entirely.
 */
export function renderReportDocument(report: ReportSnapshot, language: ReportLocale = "en", hidden: ReadonlySet<string> = new Set()): string {
  locale = language;
  S = reportStrings(language);
  const show = (section: string) => !hidden.has(section);
  const m = report.metrics;
  const results = report.results;
  const findings = bySeverity(report.findings);
  const improvements = [...report.improvements].sort((a, b) => a.priority - b.priority);
  const scored = results.filter((item) => item.outcome !== "unscorable");
  const topicMap = new Map<string, { pass: number; total: number }>();
  for (const item of scored) {
    const entry = topicMap.get(item.topic) ?? { pass: 0, total: 0 };
    entry.total += 1;
    if (item.outcome === "pass") entry.pass += 1;
    topicMap.set(item.topic, entry);
  }
  const topics = [...topicMap.entries()].map(([topic, value]) => ({ label: plain(topic), pass: value.pass, total: value.total })).sort((a, b) => a.pass / a.total - b.pass / b.total);
  const severities = SEVERITY.map((level) => {
    const scope = scored.filter((item) => item.severity === level);
    return { label: plain(level), pass: scope.filter((item) => item.outcome === "pass").length, total: scope.length };
  }).filter((row) => row.total);
  const matrix = SEVERITY.map((level) => ({ level, counts: OUTCOME_ORDER.map((outcome) => results.filter((item) => item.severity === level && item.outcome === outcome).length) })).filter((row) => row.counts.some(Boolean));
  const criticalFailed = results.filter((item) => item.severity === "critical" && (item.outcome === "fail" || item.outcome === "partial")).length;
  const incomplete = m.headline_status === "incomplete";
  const ordered = [...results].sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome) || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const number = new Map(ordered.map((item, index) => [item.assessment_id, index + 1]));
  const refs = (ids: string[]) =>
    ids
      .map((id) => number.get(id))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b)
      .map((value) => `T${value}`)
      .join(", ");
  const dates = day(report.scope.started_at) === day(report.scope.finished_at) ? day(report.scope.started_at) : `${day(report.scope.started_at)} – ${day(report.scope.finished_at)}`;

  const takeaways = report.takeaways.length
    ? `<section class="block keep"><h2>${S.keyTakeaways}</h2><ol class="takeaways">${report.takeaways.map((item) => `<li><p>${escapeHtml(tx(item.text))}</p>${item.assessment_ids.length ? `<span class="ref">${S.evidence}: ${refs(item.assessment_ids)}</span>` : ""}</li>`).join("")}</ol></section>`
    : "";

  const findingBlocks = findings.length
    ? findings
        .map(
          (finding, index) => `<article class="finding">
  <header><span class="index">F${index + 1}</span><h3>${escapeHtml(tx(finding.title))}</h3>${chip(finding.severity)}</header>
  <p class="facts">${finding.frequency_n} of ${finding.frequency_denominator} ${S.relevantResults} · ${S.evidence}: ${escapeHtml(finding.evidence_strength.replaceAll("_", " "))}${finding.assessment_ids.length ? ` · ${S.tests} ${refs(finding.assessment_ids)}` : ""}</p>
  <dl>
    <div><dt>${S.observed}</dt><dd>${escapeHtml(tx(finding.observation))}</dd></div>
    ${finding.cause_hypothesis ? `<div><dt>${S.hypothesis}</dt><dd>${escapeHtml(finding.cause_hypothesis)} <span class="muted">(${S.notVerifiedCause})</span></dd></div>` : ""}
    <div><dt>${S.recommendedAction}</dt><dd>${escapeHtml(tx(finding.recommendation))}</dd></div>
  </dl>
</article>`,
        )
        .join("")
    : `<p class="muted">${S.noFindings}</p>`;

  const improvementRows = improvements.length
    ? `<table class="grid"><thead><tr><th class="n">#</th><th>${S.improvement}</th><th>${S.status}</th><th>${S.validationPlan}</th></tr></thead><tbody>${improvements
        .map(
          (item) =>
            `<tr><td class="n">${item.priority}</td><td><b>${escapeHtml(item.title)}</b>${item.owner ? `<br><span class="muted">${S.owner}: ${escapeHtml(item.owner)}</span>` : ""}${item.finding_ids.length ? `<br><span class="muted">${S.addresses} ${item.finding_ids.map((id) => `F${findings.findIndex((f) => f.id === id) + 1}`).filter((v) => v !== "F0").join(", ")}</span>` : ""}</td><td>${label(item.status)}</td><td>${escapeHtml(item.validation_plan)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">${S.noImprovements}</p>`;

  const resultRows = ordered
    .map((item) => `<tr><td class="n">T${number.get(item.assessment_id)}</td><td>${escapeHtml(item.title)}<br><span class="muted">${escapeHtml(item.topic.replaceAll("_", " "))}</span></td><td>${chip(item.severity)}</td><td>${chip(item.label ?? item.outcome)}</td><td class="rationale">${escapeHtml(item.rationale)}</td></tr>`)
    .join("");

  const evidence = ordered
    .map(
      (item) => `<article class="evidence">
  <header><span class="index">T${number.get(item.assessment_id)}</span><h3>${escapeHtml(item.title)}</h3>${chip(item.label ?? item.outcome)}${chip(item.severity)}</header>
  <p class="ids">${S.caseId} ${escapeHtml(item.case_revision_id)} · ${S.observationId} ${escapeHtml(item.observation_id)} · ${S.assessmentId} ${escapeHtml(item.assessment_id)}</p>
  <div class="turn user"><span class="who">${S.question}</span>${pre(item.input)}</div>
  <div class="turn system"><span class="who">${S.systemResponse}</span>${pre(item.output)}${item.offered_actions?.length ? `<p class="ids">${S.offeredOptions}: ${item.offered_actions.map(escapeHtml).join(" · ")}</p>` : ""}</div>
  ${item.expected ? `<div class="turn user"><span class="who">${S.expectedAnswer}</span>${pre(item.expected)}</div>` : ""}
  <p class="assessment"><b>${S.assessment}.</b> ${escapeHtml(item.rationale)}</p>
  ${item.source_refs.length ? `<p class="ids">${S.sources}: ${item.source_refs.map((ref) => `${escapeHtml(ref.source_revision_id)}#${escapeHtml(ref.anchor)}`).join(" · ")}</p>` : ""}
</article>`,
    )
    .join("");

  const limitations = [...report.methodology.limitations, ...report.methodology.exclusions].map(tx);

  const meta = [
    ...(show("scope") ? [`<div><dt>${S.evaluated}</dt><dd>${dates}</dd></div>`] : []),
    ...(show("system") ? [`<div><dt>${S.whatWasTested}</dt><dd>${label(report.system.execution_mode)}</dd></div>`] : []),
    ...(show("scope") ? [`<div><dt>${S.evidencePolicy}</dt><dd>${label(report.scope.evidence_policy)}</dd></div>`] : []),
    ...(show("metrics") ? [`<div><dt>${S.testsAssessed}</dt><dd>${m.n_scorable} ${S.of} ${m.n_eligible} ${S.eligible}</dd></div>`] : []),
    ...(show("scope") ? [`<div><dt>${S.reviewStatus}</dt><dd>${label(report.scope.review_status)}</dd></div>`] : []),
    ...(show("metrics") ? [`<div><dt>${S.resultStatus}</dt><dd>${label(m.headline_status)}</dd></div>`] : []),
  ];
  // Numbered in reading order, so a shared copy without some sections has no gaps.
  let numbered = 0;
  const num = () => `<span class="num">${++numbered}</span>`;
  const glance = show("results")
    ? `<h2>${num()}${S.resultsAtAGlance}</h2>
  <p class="lead">${S.ratesLead}</p>
  <div class="two">
    <div><h3 style="font-size:10pt;margin-bottom:6px">${S.byTopic}</h3>${topics.length ? rateRows(topics) : `<p class="muted">${S.noAssessedTopics}</p>`}</div>
    <div><h3 style="font-size:10pt;margin-bottom:6px">${S.bySeverity}</h3>${severities.length ? rateRows(severities) : `<p class="muted">${S.noAssessedTests}</p>`}</div>
  </div>
  ${matrix.length ? `<div class="block keep"><h3 style="font-size:10pt;margin-bottom:6px">${S.outcomesBySeverity}</h3><table class="grid"><thead><tr><th>${S.severity}</th>${OUTCOME_ORDER.map((o) => `<th class="c">${label(o)}</th>`).join("")}</tr></thead><tbody>${matrix.map((row) => `<tr><td>${chip(row.level)}</td>${row.counts.map((count) => `<td class="c">${count || '<span class="muted">·</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}`
    : "";
  const findingsPart = show("findings") ? `<div class="block"><h2>${num()}${S.findings}</h2><p class="lead">${S.findingsLead}</p>${findingBlocks}</div>` : "";
  const improvementsPart = show("improvements") ? `<h2>${num()}${S.improvements}</h2>
  <p class="lead">${S.improvementsLead}</p>
  ${improvementRows}` : "";
  const resultsPart = show("results")
    ? `<div class="block"><h2>${num()}${S.testResults}</h2><p class="lead">${S.testResultsLead}</p>
  <table class="grid"><colgroup><col style="width:9mm"><col style="width:34%"><col style="width:15mm"><col style="width:17mm"><col></colgroup><thead><tr><th class="n">#</th><th>${S.test}</th><th>${S.severity}</th><th>${S.outcome}</th><th>${S.assessment}</th></tr></thead><tbody>${resultRows}</tbody></table></div>`
    : "";
  const identifiers = `<dt>${S.run}</dt><dd class="mono">${escapeHtml(report.run_id)}</dd>
    <dt>${S.reportRevision}</dt><dd class="mono">${escapeHtml(report.report_revision_id)}</dd>
    <dt>${S.contentHash}</dt><dd class="mono">${escapeHtml(report.content_hash)}</dd>`;
  const appendix = show("methodology")
    ? `<h2><span class="num">B</span>${S.methodologyLimitations}</h2>
  ${show("metrics") ? `<p class="lead">${S.denominatorsLead}</p>
  <div class="denoms">
    <div><span>${S.planned}</span><b>${m.n_planned}</b></div><div><span>${S.eligibleCap}</span><b>${m.n_eligible}</b></div><div><span>${S.executed}</span><b>${m.n_executed}</b></div>
    <div><span>${S.assessed}</span><b>${m.n_scorable}</b></div><div><span>${S.notScored}</span><b>${m.n_unscorable}</b></div><div><span>${S.pending}</span><b>${m.n_pending}</b></div>
  </div>` : ""}
  <dl class="defs">
    ${show("system") && show("scope") ? `<dt>${S.scope}</dt><dd>${label(report.system.execution_mode)} · ${label(report.scope.evidence_policy)} · ${S.languages} ${escapeHtml(report.scope.languages.join(", ") || "—")}</dd>` : ""}
    <dt>${S.sampling}</dt><dd>${escapeHtml(tx(report.methodology.sampling || "—"))}</dd>
    <dt>${S.reviewCoverage}</dt><dd>${escapeHtml(tx(report.methodology.review_coverage || "—"))}</dd>
    <dt>${S.scoring}</dt><dd>${escapeHtml(report.methodology.scorer_version)} · CEF ${escapeHtml(report.methodology.cef_version)} · ${S.graders} ${escapeHtml(report.methodology.grader_revisions.join(", ") || "—")}</dd>
    ${show("metrics") && m.pass_bounds ? `<dt>${S.missingBounds}</dt><dd>${pct(m.pass_bounds.low)}–${pct(m.pass_bounds.high)} ${S.missingBoundsHelp}</dd>` : ""}
    ${show("metrics") && m.wilson_interval ? `<dt>${S.uncertainty}</dt><dd>${S.wilson}: ${pct(m.wilson_interval.low)}–${pct(m.wilson_interval.high)}</dd>` : ""}
    <dt>${S.sources}</dt><dd>${report.methodology.source_revisions.length} ${report.methodology.source_revisions.length === 1 ? S.sourceRevision : S.sourceRevisions}</dd>
    ${show("scope") ? `<dt>${S.testSet}</dt><dd class="mono">${escapeHtml(report.scope.suite_version_id)}</dd>` : ""}
    ${identifiers}
  </dl>
  <div class="block"><h3 style="font-size:10pt;margin-bottom:6px">${S.limitations}</h3>${limitations.length ? `<ul class="plain">${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">${S.noLimitations}</p>`}</div>`
    : `<h2><span class="num">B</span>${S.identifiers}</h2>
  <dl class="defs">${identifiers}</dl>`;
  const body = [
    // Without the results, findings and improvements are short enough to share a page.
    glance || findingsPart ? `<section class="section">
  ${glance}
  ${findingsPart}
  ${show("results") ? "" : `<div class="block">${improvementsPart}</div>`}
</section>` : "",
    (show("results") || !findingsPart) && (improvementsPart || resultsPart) ? `<section class="section">
  ${improvementsPart}
  ${resultsPart}
</section>` : "",
    show("results") ? `<section class="section">
  <h2><span class="num">A</span>${S.interactionEvidence}</h2>
  <p class="lead">${S.evidenceLead}</p>
  ${evidence || `<p class="muted">${S.noResults}</p>`}
</section>` : "",
    `<section class="section">
  ${appendix}
  ${hidden.size ? `<p class="disclaimer">${S.sharedCopy}</p>` : ""}
  <p class="disclaimer">${S.disclaimer}</p>
</section>`,
  ].filter(Boolean).join("\n\n");

  return `<!doctype html><html lang="${locale === "es" ? "es" : "en"}"><head><meta charset="utf-8"><title>${show("system") ? `${escapeHtml(report.system.name)} — ` : ""}${S.evaluationReport}</title><style>
@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${GEIST_WOFF2}) format("woff2");font-weight:100 900;font-style:normal}
@font-face{font-family:"Geist Mono";src:url(data:font/woff2;base64,${GEIST_MONO_WOFF2}) format("woff2");font-weight:100 900;font-style:normal}
@page{size:A4;margin:18mm 16mm 20mm}
:root{--ink:#141413;--ink-2:#3b3a36;--muted:#6b6a63;--faint:#9a9a94;--line:#e6e4de;--soft:#f5f4f0;--pass:#15803d;--pass-soft:#e9f6ee;--warn:#b45309;--warn-soft:#fdf3e4;--fail:#b91c1c;--fail-soft:#fcebea;--neutral:#a8a49c}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Geist",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.5;color:var(--ink);font-variant-numeric:tabular-nums}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.015em;break-after:avoid}
p{margin:0}
.muted{color:var(--muted)}
.brandbar{display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--line);font-size:9pt;color:var(--muted)}
.brandbar .name{font-weight:600;color:var(--ink);letter-spacing:-.02em;font-size:11pt}
.brandbar .spacer{flex:1}
.mark{width:15px;height:15px;fill:var(--ink)}
.cover{padding-top:0}
.cover .eyebrow{margin-top:24mm}
.eyebrow{font-size:9pt;font-weight:500;color:var(--muted)}
h1{font-size:27pt;line-height:1.1;letter-spacing:-.03em;margin:6px 0 10px}
.lede{font-size:11.5pt;color:var(--ink-2);max-width:150mm}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 18px;margin:18px 0 0;padding:14px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.meta dt{font-size:8pt;color:var(--muted)}
.meta dd{margin:1px 0 0;font-weight:500}
.alert{margin-top:14px;padding:10px 12px;border-radius:6px;background:var(--warn-soft);color:#7a3a06;font-size:9.5pt}
.alert ul{margin:6px 0 0;padding-left:16px}
.headline{display:grid;grid-template-columns:1.15fr 1fr;gap:16px;margin-top:20px;break-inside:avoid}
.score{padding:16px 18px;border:1px solid var(--line);border-radius:8px}
.score .k{font-size:9pt;color:var(--muted)}
.score .big{display:block;font-size:44pt;font-weight:600;line-height:1;letter-spacing:-.045em;margin:6px 0 6px}
.score .cap{font-size:9pt;color:var(--muted)}
.kpis{display:grid;grid-template-rows:repeat(3,1fr);border:1px solid var(--line);border-radius:8px}
.kpis div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 14px;border-top:1px solid var(--line)}
.kpis div:first-child{border-top:0}
.kpis span{font-size:9pt;color:var(--muted)}
.kpis b{font-size:15pt;font-weight:600;letter-spacing:-.02em;text-align:right}
.kpis small{display:block;font-size:7.5pt;color:var(--faint);text-align:right}
.outcomes{margin-top:14px;break-inside:avoid}
.bar{display:flex;gap:2px;height:9px;border-radius:5px;overflow:hidden}
.bar span{display:block;height:100%}
[data-tone="pass"]{background:var(--pass)}[data-tone="warn"]{background:var(--warn)}[data-tone="fail"]{background:var(--fail)}[data-tone="neutral"]{background:var(--neutral)}[data-tone="empty"]{background:var(--line)}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:8px 0 0;padding:0;list-style:none;font-size:9pt;color:var(--muted)}
.legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
.legend b{color:var(--ink);font-weight:600}
.block{margin-top:22px}
.keep{break-inside:avoid}
h2{font-size:14pt;margin-bottom:10px}
h2 .num{color:var(--faint);font-weight:500;margin-right:6px}
.section{break-before:page}
.lead{color:var(--muted);font-size:9.5pt;margin:-4px 0 12px;max-width:160mm}
.takeaways{margin:0;padding:0;list-style:none;counter-reset:t}
.takeaways li{counter-increment:t;display:grid;grid-template-columns:22px 1fr;column-gap:8px;padding:8px 0;border-top:1px solid var(--line);break-inside:avoid}
.takeaways li::before{content:counter(t);grid-row:span 2;width:18px;height:18px;border-radius:50%;background:var(--soft);font-size:8pt;font-weight:600;display:flex;align-items:center;justify-content:center;color:var(--ink-2)}
.ref{font-size:8pt;color:var(--muted)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.rates{width:100%;border-collapse:collapse;font-size:9pt}
.rates th{text-align:left;font-weight:500;padding:5px 8px 5px 0;width:34%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
.rates td{padding:5px 0}
.rates .track{width:44%}
.rates .track span{display:block;height:6px;border-radius:3px;background:var(--ink)}
.rates .track{background:linear-gradient(var(--soft),var(--soft)) no-repeat left center/100% 6px}
.rates .num{text-align:right;font-weight:600;padding-left:8px;width:11%}
.rates .den{text-align:right;color:var(--faint);width:11%}
table.grid{width:100%;border-collapse:collapse;font-size:9pt}
table.grid thead{display:table-header-group}
table.grid th{text-align:left;font-weight:500;color:var(--muted);font-size:8pt;padding:6px 8px;border-bottom:1px solid var(--ink)}
table.grid td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
table.grid tr{break-inside:avoid}
table.grid .n{width:9mm;color:var(--muted);font-weight:500}
table.grid .c{text-align:center}
.rationale{color:var(--ink-2)}
.chip{display:inline-block;padding:1px 6px;border-radius:4px;font-size:7.5pt;font-weight:600;white-space:nowrap;background:#f0efeb;color:#57534e}
.chip[data-tone="pass"]{background:var(--pass-soft);color:var(--pass)}.chip[data-tone="warn"]{background:var(--warn-soft);color:var(--warn)}.chip[data-tone="fail"]{background:var(--fail-soft);color:var(--fail)}
.finding{padding:12px 0;border-top:1px solid var(--line);break-inside:avoid}
.finding header,.evidence header{display:flex;align-items:baseline;gap:8px}
.finding h3,.evidence h3{font-size:11pt;flex:1}
.index{font-size:8.5pt;font-weight:600;color:var(--faint);min-width:20px}
.facts{margin:4px 0 8px 28px;font-size:8.5pt;color:var(--muted)}
.finding dl{margin:0 0 0 28px}
.finding dl div{display:grid;grid-template-columns:34mm 1fr;gap:10px;padding:3px 0}
.finding dt{color:var(--muted);font-size:9pt}
.finding dd{margin:0}
.evidence{padding:12px 0;border-top:1px solid var(--line);break-inside:avoid}
.ids{font-family:"Geist Mono",ui-monospace,monospace;font-size:7pt;color:var(--faint);margin:3px 0 6px 28px;overflow-wrap:anywhere}
.turn{margin:6px 0 0 28px}
.who{display:block;font-size:7.5pt;font-weight:600;color:var(--muted);margin-bottom:2px}
pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-family:"Geist",sans-serif;font-size:9pt;line-height:1.45;padding:7px 9px;border-radius:5px;background:var(--soft)}
.system pre{background:#fff;border:1px solid var(--line)}
.assessment{margin:8px 0 0 28px;font-size:9pt;color:var(--ink-2)}
.defs{display:grid;grid-template-columns:44mm 1fr;margin:0;font-size:9pt}
.defs dt,.defs dd{padding:5px 0;border-top:1px solid var(--line);margin:0}
.defs dt{color:var(--muted)}
.denoms{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid var(--line);border-radius:8px;margin:4px 0 16px}
.denoms div{padding:8px 10px;border-left:1px solid var(--line)}
.denoms div:first-child{border-left:0}
.denoms span{display:block;font-size:7.5pt;color:var(--muted)}
.denoms b{font-size:13pt;font-weight:600}
ul.plain{margin:0;padding-left:16px}
ul.plain li{margin:3px 0}
.disclaimer{margin-top:16px;padding-top:10px;border-top:1px solid var(--line);font-size:8pt;color:var(--muted)}
.mono{font-family:"Geist Mono",ui-monospace,monospace;font-size:7.5pt;overflow-wrap:anywhere}
</style></head><body>

<section class="cover">
  <div class="brandbar">${LOGO}<span class="name">Caudals</span><span>${S.evaluationReport}</span><span class="spacer"></span>${show("scope") ? chip(report.scope.review_status, report.scope.review_status === "reviewed" ? "pass" : "neutral") : ""}<span>${day(report.created_at)}</span></div>
  ${show("system") ? `<p class="eyebrow">${S.evaluationOf}</p>
  <h1>${escapeHtml(report.system.name)}</h1>
  <p class="lede">${escapeHtml(report.system.purpose)}</p>` : `<h1>${S.evaluationReport}</h1>`}
  ${meta.length ? `<dl class="meta">${meta.join("")}</dl>` : ""}
  ${incomplete ? `<div class="alert"><b>${S.incompleteResult}</b> ${S.incompleteHelp}${limitations.length ? `<ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</div>` : ""}
  ${show("metrics") ? `<div class="headline">
    <div class="score">
      <span class="k">${S.strictPassRate}</span>
      <span class="big">${pct(m.strict_pass_rate, 1)}</span>
      <span class="cap">${m.n_pass} ${S.of} ${m.n_scorable} ${S.assessedTestsPassed}${m.wilson_interval ? ` · ${S.interval95} ${pct(m.wilson_interval.low)}–${pct(m.wilson_interval.high)}` : ""}</span>
      <div class="outcomes">${outcomeBar({ pass: m.n_pass, partial: m.n_partial, fail: m.n_fail, unscorable: m.n_unscorable })}</div>
    </div>
    <div class="kpis">
      <div><span>${S.assessedCoverage}</span><b>${pct(m.assessed_coverage)}<small>${m.n_scorable} ${S.of} ${m.n_eligible}</small></b></div>
      ${show("results") ? `<div><span>${S.criticalFailures}</span><b>${criticalFailed}<small>${m.critical_unassessed ? `${m.critical_unassessed} ${S.criticalNotAssessed}` : S.criticalFailedOrPartial}</small></b></div>` : ""}
      ${m.rubric_score != null || show("findings") ? `<div><span>${m.rubric_score != null ? S.rubricScore : S.findings}</span><b>${m.rubric_score != null ? `${Math.round(m.rubric_score)}/100` : findings.length}<small>${m.rubric_score != null ? S.weightedCriteria : S.evidencePatterns}</small></b></div>` : ""}
    </div>
  </div>` : ""}
  ${takeaways}
</section>

${body}
</body></html>`;
}

/** Page footer for the PDF: identifies the document on every page. */
export function reportFooterTemplate(report: ReportSnapshot, language: ReportLocale = "en", hidden: ReadonlySet<string> = new Set()): string {
  const strings = reportStrings(language);
  return `<div style="width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#9a9a94"><span>Caudals · ${hidden.has("system") ? "" : `${escapeHtml(report.system.name)} · `}${strings.revision} ${escapeHtml(report.report_revision_id.slice(0, 8))} · ${escapeHtml(reportDate(report.created_at, language))}</span><span>${strings.page} <span class="pageNumber"></span> ${strings.pageOf} <span class="totalPages"></span></span></div>`;
}
