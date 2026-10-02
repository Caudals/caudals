/**
 * The client report as an editable Word document. Same immutable snapshot and
 * section order as the PDF (./document.ts): summary and headline metrics →
 * takeaways → findings → improvements → test results → methodology. Text only,
 * so the customer can annotate and forward it; the PDF stays the reference copy.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { reportSnapshotSchema, type ReportSnapshot } from "./contracts";
import { localizeReportText, reportDate, reportLabel, reportStrings, type ReportLocale } from "./i18n";

const SEVERITY = ["critical", "high", "medium", "low"] as const;
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const LABEL: Record<string, string> = {
  correct: "Correct", partially_correct: "Partly correct", incorrect: "Incorrect", not_answered: "No answer",
  test_issue: "Test needs review", capture_issue: "Not captured", not_run: "Not run", pending: "Not scored",
  pass: "Pass", partial: "Partial", fail: "Fail", unscorable: "Not scored",
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
  preliminary: "Preliminary", reviewed: "Reviewed", complete: "Complete", incomplete: "Incomplete",
  deployed_system: "Deployed system", controlled_model: "Controlled model", imported_responses: "Imported answers",
  exploratory: "Exploratory", source_grounded: "Source-grounded",
  proposed: "Proposed", planned: "Planned", in_progress: "In progress", validated: "Validated", closed: "Closed",
};
let locale: ReportLocale = "en";
const plain = (value: string) => reportLabel(LABEL[value] ?? value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()), locale);
const pct = (value: number | null | undefined) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const day = (value: string) => reportDate(value, locale);
const tx = (text: string) => localizeReportText(text, locale);
/** Word rejects XML control characters; model output can contain them. */
const clean = (value: unknown) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const FONT = "Calibri";
const MUTED = "6B6B6B";
const text = (value: unknown, options: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) => new TextRun({ text: clean(value), font: FONT, ...options });
const para = (value: unknown, options: { bold?: boolean; color?: string; size?: number; after?: number } = {}) =>
  new Paragraph({ spacing: { after: options.after ?? 120 }, children: [text(value, options)] });
const heading = (value: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) =>
  new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [text(value, { bold: true })] });
/** Multi-line text (answers, rationales) keeps its line breaks. */
const block = (value: string, color?: string) =>
  new Paragraph({ spacing: { after: 120 }, children: clean(value).split("\n").flatMap((line, index) => [...(index ? [new TextRun({ break: 1 })] : []), text(line, { color, size: 20 })]) });

function cell(value: string, options: { bold?: boolean; header?: boolean; width?: number } = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.header ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2EF" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [text(value, { bold: options.bold || options.header, size: 20 })] })],
  });
}
function table(headers: string[], rows: string[][], widths?: number[]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D4" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((value, index) => cell(value, { header: true, width: widths?.[index] })) }),
      ...rows.map((row) => new TableRow({ children: row.map((value, index) => cell(value, { width: widths?.[index] })) })),
    ],
  });
}

export async function renderReportDocx(raw: ReportSnapshot, language: ReportLocale = "en"): Promise<Buffer> {
  locale = language;
  const S = reportStrings(language);
  const report = reportSnapshotSchema.parse(raw);
  const m = report.metrics;
  const results = [...report.results].sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome) || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const number = new Map(results.map((item, index) => [item.assessment_id, index + 1]));
  const refs = (ids: string[]) => ids.map((id) => number.get(id)).filter((value): value is number => value != null).sort((a, b) => a - b).map((value) => `T${value}`).join(", ");
  const findings = [...report.findings].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const improvements = [...report.improvements].sort((a, b) => a.priority - b.priority);
  const dates = day(report.scope.started_at) === day(report.scope.finished_at) ? day(report.scope.started_at) : `${day(report.scope.started_at)} – ${day(report.scope.finished_at)}`;
  const counts = { pass: m.n_pass, partial: m.n_partial, fail: m.n_fail, unscorable: m.n_unscorable };

  const children: Array<Paragraph | Table> = [
    new Paragraph({ spacing: { after: 60 }, children: [text(S.eyebrow, { color: MUTED, size: 18, bold: true })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [text(report.system.name, { bold: true, size: 44 })] }),
    ...(report.system.purpose ? [para(report.system.purpose, { color: MUTED })] : []),
    para(`${plain(report.system.execution_mode)} · ${dates} · ${plain(report.scope.review_status)}${m.headline_status === "incomplete" ? ` · ${plain("incomplete")}` : ""}`, { color: MUTED, size: 20, after: 240 }),

    heading(S.resultsAtAGlance),
    table([S.measure, S.value], [
      [S.strictPassRate, `${pct(m.strict_pass_rate)} (${m.n_pass} ${S.of} ${m.n_scorable} ${S.scoredWord})`],
      ...(m.wilson_interval ? [[S.interval95, `${pct(m.wilson_interval.low)} – ${pct(m.wilson_interval.high)}`]] : []),
      [S.outcomes, `${counts.pass} ${S.pass} · ${counts.partial} ${S.partial} · ${counts.fail} ${S.fail} · ${counts.unscorable} ${S.notScoredLower}`],
      [S.testsPlannedExecuted, `${m.n_planned} / ${m.n_executed}`],
      ...(m.critical_unassessed ? [[S.criticalNotAssessedLong, String(m.critical_unassessed)]] : []),
    ], [40, 60]),
  ];

  if (report.takeaways.length) {
    children.push(heading(S.keyTakeaways));
    report.takeaways.forEach((item, index) => {
      children.push(new Paragraph({ spacing: { after: 80 }, children: [text(`${index + 1}. `, { bold: true }), text(tx(item.text))] }));
      if (item.assessment_ids.length) children.push(para(`${S.evidence}: ${refs(item.assessment_ids)}`, { color: MUTED, size: 18 }));
    });
  }

  children.push(heading(S.findings));
  if (!findings.length) children.push(para(S.noFindingsShort, { color: MUTED }));
  for (const finding of findings) {
    children.push(heading(`${plain(finding.severity)} · ${tx(finding.title)}`, HeadingLevel.HEADING_2));
    children.push(para(`${S.seenIn} ${finding.frequency_n} ${S.of} ${finding.frequency_denominator} ${S.relevantResults} · ${S.evidence}: ${plain(finding.evidence_strength)}${finding.assessment_ids.length ? ` · ${refs(finding.assessment_ids)}` : ""}`, { color: MUTED, size: 18 }));
    children.push(para(tx(finding.observation)));
    if (finding.cause_hypothesis) children.push(new Paragraph({ spacing: { after: 100 }, children: [text(`${S.likelyCause}: `, { bold: true }), text(finding.cause_hypothesis)] }));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [text(`${S.recommendation}: `, { bold: true }), text(tx(finding.recommendation))] }));
  }

  if (improvements.length) {
    children.push(heading(S.improvements));
    children.push(table(["#", S.improvement, S.status, S.howValidated], improvements.map((item) => [String(item.priority), item.title, plain(item.status), item.validation_plan]), [6, 38, 14, 42]));
  }

  children.push(heading(S.testResults));
  children.push(table([S.test, S.title, S.topic, S.severity, S.outcome], results.map((item) => [`T${number.get(item.assessment_id)}`, item.title, plain(item.topic), plain(item.severity), plain(item.label ?? item.outcome)]), [8, 44, 20, 14, 14]));

  children.push(heading(S.interactionEvidence));
  for (const item of results) {
    children.push(heading(`T${number.get(item.assessment_id)} · ${item.title} — ${plain(item.label ?? item.outcome)}`, HeadingLevel.HEADING_3));
    children.push(para(S.question, { bold: true, size: 20, after: 40 }));
    children.push(block(item.input));
    children.push(para(S.answer, { bold: true, size: 20, after: 40 }));
    children.push(block(item.output || "—"));
    if (item.offered_actions?.length) children.push(block(`${S.offeredOptions}: ${item.offered_actions.join(" · ")}`, MUTED));
    if (item.expected) {
      children.push(para(S.expectedAnswer, { bold: true, size: 20, after: 40 }));
      children.push(block(item.expected));
    }
    if (item.rationale) {
      children.push(para(S.why, { bold: true, size: 20, after: 40 }));
      children.push(block(item.rationale, MUTED));
    }
  }

  const method = report.methodology;
  children.push(heading(S.methodologyLimitations));
  children.push(table([S.item, S.detail], [
    [S.evaluationFormat, `CEF ${method.cef_version} · ${S.scorerWord} ${method.scorer_version}`],
    [S.evidencePolicy, plain(report.scope.evidence_policy)],
    [S.sampling, tx(method.sampling)],
    [S.reviewCoverage, tx(method.review_coverage)],
    ...(method.exclusions.length ? [[S.excludedFromScoring, method.exclusions.map(tx).join(", ")]] : []),
    ...(method.cost ? [[S.modelCost, `${method.cost.settled} ${method.cost.currency} ${S.settled}`]] : []),
    [S.reportRevision, report.report_revision_id],
    [S.contentHash, report.content_hash],
  ], [30, 70]));
  if (method.limitations.length) {
    children.push(heading(S.limitations, HeadingLevel.HEADING_2));
    for (const limitation of method.limitations) children.push(new Paragraph({ bullet: { level: 0 }, children: [text(tx(limitation))] }));
  }
  children.push(para(S.notCertification, { color: MUTED, size: 18 }));

  const document = new Document({
    creator: "Caudals",
    title: `${clean(report.system.name)} — ${S.evaluationReport}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [text(`Caudals · ${clean(report.system.name)} · ${S.revision} ${report.report_revision_id.slice(0, 8)} · ${S.page} `, { color: MUTED, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, color: MUTED, size: 16 })],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}
