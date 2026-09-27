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

type Result = ReportSnapshot["results"][number];
const SEVERITY = ["critical", "high", "medium", "low"] as const;
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const LABEL: Record<string, string> = {
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
const TONE: Record<string, string> = { pass: "pass", partial: "warn", fail: "fail", unscorable: "neutral", critical: "fail", high: "fail", medium: "warn", low: "neutral" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
const plain = (value: string) => LABEL[value] ?? value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const label = (value: string) => escapeHtml(plain(value));
const pct = (value: number | null | undefined, digits = 0) => (value == null ? "—" : `${(value * 100).toFixed(digits)}%`);
const day = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const chip = (value: string, tone = TONE[value] ?? "neutral") => `<span class="chip" data-tone="${tone}">${label(value)}</span>`;
const LOGO = `<svg class="mark" viewBox="0 0 1080 1080" aria-hidden="true"><path d="M77 221.441C77 199.892 99.045 185.37 118.844 193.877L304.477 273.638C315.493 278.372 322.633 289.211 322.633 301.202V752.494C322.633 764.484 315.493 775.323 304.477 780.056L118.844 859.818C99.045 868.325 77 853.804 77 832.254V221.441Z"/><path d="M417.621 129.676C417.621 106.723 442.348 92.272 462.347 103.538L647.979 208.115C657.415 213.432 663.254 223.422 663.254 234.253V842.707C663.254 853.538 657.415 863.529 647.979 868.845L462.347 973.421C442.348 984.687 417.621 970.237 417.621 947.283V129.676Z"/><path d="M758.242 45.05C758.242 21.006 785.112 6.732 805.036 20.192L990.668 145.597C998.926 151.176 1003.87 160.49 1003.87 170.456V910.272C1003.87 920.238 998.926 929.553 990.668 935.131L805.036 1060.54C785.112 1074 758.242 1059.72 758.242 1035.68V45.05Z"/></svg>`;

function outcomeBar(counts: Record<"pass" | "partial" | "fail" | "unscorable", number>) {
  const total = counts.pass + counts.partial + counts.fail + counts.unscorable;
  const order = ["pass", "partial", "fail", "unscorable"] as const;
  const segments = total
    ? order.filter((key) => counts[key]).map((key) => `<span data-tone="${TONE[key]}" style="width:${((counts[key] / total) * 100).toFixed(3)}%"></span>`).join("")
    : `<span data-tone="empty" style="width:100%"></span>`;
  const legend = order.map((key) => `<li><i data-tone="${TONE[key]}"></i>${LABEL[key]} <b>${counts[key]}</b></li>`).join("");
  return `<div class="bar" role="img" aria-label="${order.map((key) => `${counts[key]} ${LABEL[key].toLowerCase()}`).join(", ")}">${segments}</div><ul class="legend">${legend}</ul>`;
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

export function renderReportDocument(report: ReportSnapshot): string {
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
    return { label: LABEL[level], pass: scope.filter((item) => item.outcome === "pass").length, total: scope.length };
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
    ? `<section class="block keep"><h2>Key takeaways</h2><ol class="takeaways">${report.takeaways.map((item) => `<li><p>${escapeHtml(item.text)}</p>${item.assessment_ids.length ? `<span class="ref">Evidence: ${refs(item.assessment_ids)}</span>` : ""}</li>`).join("")}</ol></section>`
    : "";

  const findingBlocks = findings.length
    ? findings
        .map(
          (finding, index) => `<article class="finding">
  <header><span class="index">F${index + 1}</span><h3>${escapeHtml(finding.title)}</h3>${chip(finding.severity)}</header>
  <p class="facts">${finding.frequency_n} of ${finding.frequency_denominator} relevant results · Evidence: ${escapeHtml(finding.evidence_strength.replaceAll("_", " "))}${finding.assessment_ids.length ? ` · Tests ${refs(finding.assessment_ids)}` : ""}</p>
  <dl>
    <div><dt>Observed</dt><dd>${escapeHtml(finding.observation)}</dd></div>
    ${finding.cause_hypothesis ? `<div><dt>Hypothesis</dt><dd>${escapeHtml(finding.cause_hypothesis)} <span class="muted">(not a verified root cause)</span></dd></div>` : ""}
    <div><dt>Recommended action</dt><dd>${escapeHtml(finding.recommendation)}</dd></div>
  </dl>
</article>`,
        )
        .join("")
    : `<p class="muted">No supported failure pattern was found in the assessed results.</p>`;

  const improvementRows = improvements.length
    ? `<table class="grid"><thead><tr><th class="n">#</th><th>Improvement</th><th>Status</th><th>Validation plan</th></tr></thead><tbody>${improvements
        .map(
          (item) =>
            `<tr><td class="n">${item.priority}</td><td><b>${escapeHtml(item.title)}</b>${item.owner ? `<br><span class="muted">Owner: ${escapeHtml(item.owner)}</span>` : ""}${item.finding_ids.length ? `<br><span class="muted">Addresses ${item.finding_ids.map((id) => `F${findings.findIndex((f) => f.id === id) + 1}`).filter((v) => v !== "F0").join(", ")}</span>` : ""}</td><td>${label(item.status)}</td><td>${escapeHtml(item.validation_plan)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">No improvement tasks have been proposed for this revision.</p>`;

  const resultRows = ordered
    .map((item) => `<tr><td class="n">T${number.get(item.assessment_id)}</td><td>${escapeHtml(item.title)}<br><span class="muted">${escapeHtml(item.topic.replaceAll("_", " "))}</span></td><td>${chip(item.severity)}</td><td>${chip(item.outcome)}</td><td class="rationale">${escapeHtml(item.rationale)}</td></tr>`)
    .join("");

  const evidence = ordered
    .map(
      (item) => `<article class="evidence">
  <header><span class="index">T${number.get(item.assessment_id)}</span><h3>${escapeHtml(item.title)}</h3>${chip(item.outcome)}${chip(item.severity)}</header>
  <p class="ids">Case ${escapeHtml(item.case_revision_id)} · Observation ${escapeHtml(item.observation_id)} · Assessment ${escapeHtml(item.assessment_id)}</p>
  <div class="turn user"><span class="who">Question</span>${pre(item.input)}</div>
  <div class="turn system"><span class="who">System response</span>${pre(item.output)}</div>
  <p class="assessment"><b>Assessment.</b> ${escapeHtml(item.rationale)}</p>
  ${item.source_refs.length ? `<p class="ids">Sources: ${item.source_refs.map((ref) => `${escapeHtml(ref.source_revision_id)}#${escapeHtml(ref.anchor)}`).join(" · ")}</p>` : ""}
</article>`,
    )
    .join("");

  const limitations = [...report.methodology.limitations, ...report.methodology.exclusions];

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.system.name)} — Evaluation report</title><style>
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
  <div class="brandbar">${LOGO}<span class="name">Caudals</span><span>Evaluation report</span><span class="spacer"></span>${chip(report.scope.review_status, report.scope.review_status === "reviewed" ? "pass" : "neutral")}<span>${day(report.created_at)}</span></div>
  <p class="eyebrow">Evaluation of</p>
  <h1>${escapeHtml(report.system.name)}</h1>
  <p class="lede">${escapeHtml(report.system.purpose)}</p>
  <dl class="meta">
    <div><dt>Evaluated</dt><dd>${dates}</dd></div>
    <div><dt>What was tested</dt><dd>${label(report.system.execution_mode)}</dd></div>
    <div><dt>Evidence policy</dt><dd>${label(report.scope.evidence_policy)}</dd></div>
    <div><dt>Tests assessed</dt><dd>${m.n_scorable} of ${m.n_eligible} eligible</dd></div>
    <div><dt>Review status</dt><dd>${label(report.scope.review_status)}</dd></div>
    <div><dt>Result status</dt><dd>${label(m.headline_status)}</dd></div>
  </dl>
  ${incomplete ? `<div class="alert"><b>Incomplete result.</b> Assessed coverage is below the reporting threshold or a critical test was not assessed. Read these limitations before using the score:${limitations.length ? `<ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</div>` : ""}
  <div class="headline">
    <div class="score">
      <span class="k">Strict pass rate</span>
      <span class="big">${pct(m.strict_pass_rate, 1)}</span>
      <span class="cap">${m.n_pass} of ${m.n_scorable} assessed tests passed${m.wilson_interval ? ` · 95% interval ${pct(m.wilson_interval.low)}–${pct(m.wilson_interval.high)}` : ""}</span>
      <div class="outcomes">${outcomeBar({ pass: m.n_pass, partial: m.n_partial, fail: m.n_fail, unscorable: m.n_unscorable })}</div>
    </div>
    <div class="kpis">
      <div><span>Assessed coverage</span><b>${pct(m.assessed_coverage)}<small>${m.n_scorable} of ${m.n_eligible}</small></b></div>
      <div><span>Critical failures</span><b>${criticalFailed}<small>${m.critical_unassessed ? `${m.critical_unassessed} critical not assessed` : "critical tests failed or partial"}</small></b></div>
      <div><span>${m.rubric_score != null ? "Rubric score" : "Findings"}</span><b>${m.rubric_score != null ? `${Math.round(m.rubric_score)}/100` : findings.length}<small>${m.rubric_score != null ? "weighted criteria" : "evidence-backed patterns"}</small></b></div>
    </div>
  </div>
  ${takeaways}
</section>

<section class="section">
  <h2><span class="num">1</span>Results at a glance</h2>
  <p class="lead">Rates count strict passes over assessed tests in each group. Groups with few tests are indicative only.</p>
  <div class="two">
    <div><h3 style="font-size:10pt;margin-bottom:6px">By topic</h3>${topics.length ? rateRows(topics) : `<p class="muted">No assessed topics.</p>`}</div>
    <div><h3 style="font-size:10pt;margin-bottom:6px">By severity</h3>${severities.length ? rateRows(severities) : `<p class="muted">No assessed tests.</p>`}</div>
  </div>
  ${matrix.length ? `<div class="block keep"><h3 style="font-size:10pt;margin-bottom:6px">Outcomes by severity</h3><table class="grid"><thead><tr><th>Severity</th>${OUTCOME_ORDER.map((o) => `<th class="c">${LABEL[o]}</th>`).join("")}</tr></thead><tbody>${matrix.map((row) => `<tr><td>${chip(row.level)}</td>${row.counts.map((count) => `<td class="c">${count || '<span class="muted">·</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
  <div class="block"><h2><span class="num">2</span>Findings</h2><p class="lead">Patterns supported by the assessed results, most severe first. Hypotheses are labelled as such; they are not verified causes.</p>${findingBlocks}</div>
</section>

<section class="section">
  <h2><span class="num">3</span>Improvements</h2>
  <p class="lead">Prioritised changes and how each will be validated with a comparable re-run. Creating a task never changes your system.</p>
  ${improvementRows}
  <div class="block"><h2><span class="num">4</span>Test results</h2><p class="lead">Every assessed test, failures first. The numbers (T1, T2…) match the evidence appendix.</p>
  <table class="grid"><colgroup><col style="width:9mm"><col style="width:34%"><col style="width:15mm"><col style="width:17mm"><col></colgroup><thead><tr><th class="n">#</th><th>Test</th><th>Severity</th><th>Outcome</th><th>Assessment</th></tr></thead><tbody>${resultRows}</tbody></table></div>
</section>

<section class="section">
  <h2><span class="num">A</span>Interaction evidence</h2>
  <p class="lead">The exact question sent, the response captured and the assessment, with the identifiers needed to trace each result.</p>
  ${evidence || `<p class="muted">No results are included in this revision.</p>`}
</section>

<section class="section">
  <h2><span class="num">B</span>Methodology and limitations</h2>
  <p class="lead">Every rate in this report states which of these counts it divides by.</p>
  <div class="denoms">
    <div><span>Planned</span><b>${m.n_planned}</b></div><div><span>Eligible</span><b>${m.n_eligible}</b></div><div><span>Executed</span><b>${m.n_executed}</b></div>
    <div><span>Assessed</span><b>${m.n_scorable}</b></div><div><span>Not scored</span><b>${m.n_unscorable}</b></div><div><span>Pending</span><b>${m.n_pending}</b></div>
  </div>
  <dl class="defs">
    <dt>Scope</dt><dd>${label(report.system.execution_mode)} · ${label(report.scope.evidence_policy)} · languages ${escapeHtml(report.scope.languages.join(", ") || "—")}</dd>
    <dt>Sampling</dt><dd>${escapeHtml(report.methodology.sampling || "—")}</dd>
    <dt>Review coverage</dt><dd>${escapeHtml(report.methodology.review_coverage || "—")}</dd>
    <dt>Scoring</dt><dd>${escapeHtml(report.methodology.scorer_version)} · CEF ${escapeHtml(report.methodology.cef_version)} · graders ${escapeHtml(report.methodology.grader_revisions.join(", ") || "—")}</dd>
    ${m.pass_bounds ? `<dt>Missing-result bounds</dt><dd>${pct(m.pass_bounds.low)}–${pct(m.pass_bounds.high)} of eligible tests (not a confidence interval)</dd>` : ""}
    ${m.wilson_interval ? `<dt>Uncertainty</dt><dd>95% Wilson interval on the strict pass rate: ${pct(m.wilson_interval.low)}–${pct(m.wilson_interval.high)}</dd>` : ""}
    <dt>Sources</dt><dd>${report.methodology.source_revisions.length} source revision${report.methodology.source_revisions.length === 1 ? "" : "s"}</dd>
    <dt>Test set</dt><dd class="mono">${escapeHtml(report.scope.suite_version_id)}</dd>
    <dt>Run</dt><dd class="mono">${escapeHtml(report.run_id)}</dd>
    <dt>Report revision</dt><dd class="mono">${escapeHtml(report.report_revision_id)}</dd>
    <dt>Content hash</dt><dd class="mono">${escapeHtml(report.content_hash)}</dd>
  </dl>
  <div class="block"><h3 style="font-size:10pt;margin-bottom:6px">Limitations</h3>${limitations.length ? `<ul class="plain">${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No additional limitations were recorded.</p>`}</div>
  <p class="disclaimer">This report presents evaluation evidence for the tested scope, sample and dates above. It is not a certification and does not establish regulatory compliance, general safety or business impact. Results for a deployed system describe that system as observed, not its underlying model.</p>
</section>
</body></html>`;
}

/** Page footer for the PDF: identifies the document on every page. */
export function reportFooterTemplate(report: ReportSnapshot): string {
  return `<div style="width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#9a9a94"><span>Caudals · ${escapeHtml(report.system.name)} · Revision ${escapeHtml(report.report_revision_id.slice(0, 8))} · ${escapeHtml(day(report.created_at))}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}
