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

const SEVERITY = ["critical", "high", "medium", "low"] as const;
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const LABEL: Record<string, string> = {
  pass: "Pass", partial: "Partial", fail: "Fail", unscorable: "Not scored",
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
  preliminary: "Preliminary", reviewed: "Reviewed", complete: "Complete", incomplete: "Incomplete",
  deployed_system: "Deployed system", controlled_model: "Controlled model", imported_responses: "Imported answers",
  proposed: "Proposed", planned: "Planned", in_progress: "In progress", validated: "Validated", closed: "Closed",
};
const plain = (value: string) => LABEL[value] ?? value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const pct = (value: number | null | undefined) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const day = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
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

export async function renderReportDocx(raw: ReportSnapshot): Promise<Buffer> {
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
    new Paragraph({ spacing: { after: 60 }, children: [text("CAUDALS · EVALUATION REPORT", { color: MUTED, size: 18, bold: true })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [text(report.system.name, { bold: true, size: 44 })] }),
    ...(report.system.purpose ? [para(report.system.purpose, { color: MUTED })] : []),
    para(`${plain(report.system.execution_mode)} · ${dates} · ${plain(report.scope.review_status)} results${m.headline_status === "incomplete" ? " · Incomplete" : ""}`, { color: MUTED, size: 20, after: 240 }),

    heading("Results at a glance"),
    table(["Measure", "Value"], [
      ["Strict pass rate", `${pct(m.strict_pass_rate)} (${m.n_pass} of ${m.n_scorable} scored)`],
      ...(m.wilson_interval ? [["95% interval", `${pct(m.wilson_interval.low)} – ${pct(m.wilson_interval.high)}`]] : []),
      ["Outcomes", `${counts.pass} pass · ${counts.partial} partial · ${counts.fail} fail · ${counts.unscorable} not scored`],
      ["Tests planned / executed", `${m.n_planned} / ${m.n_executed}`],
      ...(m.critical_unassessed ? [["Critical tests not assessed", String(m.critical_unassessed)]] : []),
    ], [40, 60]),
  ];

  if (report.takeaways.length) {
    children.push(heading("Key takeaways"));
    report.takeaways.forEach((item, index) => {
      children.push(new Paragraph({ spacing: { after: 80 }, children: [text(`${index + 1}. `, { bold: true }), text(item.text)] }));
      if (item.assessment_ids.length) children.push(para(`Evidence: ${refs(item.assessment_ids)}`, { color: MUTED, size: 18 }));
    });
  }

  children.push(heading("Findings"));
  if (!findings.length) children.push(para("No failure patterns were found in the assessed results.", { color: MUTED }));
  for (const finding of findings) {
    children.push(heading(`${plain(finding.severity)} · ${finding.title}`, HeadingLevel.HEADING_2));
    children.push(para(`Seen in ${finding.frequency_n} of ${finding.frequency_denominator} relevant results · Evidence: ${finding.evidence_strength}${finding.assessment_ids.length ? ` · ${refs(finding.assessment_ids)}` : ""}`, { color: MUTED, size: 18 }));
    children.push(para(finding.observation));
    if (finding.cause_hypothesis) children.push(new Paragraph({ spacing: { after: 100 }, children: [text("Likely cause: ", { bold: true }), text(finding.cause_hypothesis)] }));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [text("Recommendation: ", { bold: true }), text(finding.recommendation)] }));
  }

  if (improvements.length) {
    children.push(heading("Improvements"));
    children.push(table(["#", "Improvement", "Status", "How it will be validated"], improvements.map((item) => [String(item.priority), item.title, plain(item.status), item.validation_plan]), [6, 38, 14, 42]));
  }

  children.push(heading("Test results"));
  children.push(table(["Test", "Title", "Topic", "Severity", "Outcome"], results.map((item) => [`T${number.get(item.assessment_id)}`, item.title, plain(item.topic), plain(item.severity), plain(item.outcome)]), [8, 44, 20, 14, 14]));

  children.push(heading("Interaction evidence"));
  for (const item of results) {
    children.push(heading(`T${number.get(item.assessment_id)} · ${item.title} — ${plain(item.outcome)}`, HeadingLevel.HEADING_3));
    children.push(para("Question", { bold: true, size: 20, after: 40 }));
    children.push(block(item.input));
    children.push(para("Answer", { bold: true, size: 20, after: 40 }));
    children.push(block(item.output || "—"));
    if (item.rationale) {
      children.push(para("Why", { bold: true, size: 20, after: 40 }));
      children.push(block(item.rationale, MUTED));
    }
  }

  const method = report.methodology;
  children.push(heading("Methodology and limitations"));
  children.push(table(["Item", "Detail"], [
    ["Evaluation format", `CEF ${method.cef_version} · scorer ${method.scorer_version}`],
    ["Evidence policy", plain(report.scope.evidence_policy)],
    ["Sampling", method.sampling],
    ["Review coverage", method.review_coverage],
    ...(method.exclusions.length ? [["Excluded from scoring", method.exclusions.map(plain).join(", ")]] : []),
    ...(method.cost ? [["Model cost", `${method.cost.settled} ${method.cost.currency} settled`]] : []),
    ["Report revision", report.report_revision_id],
    ["Content hash", report.content_hash],
  ], [30, 70]));
  if (method.limitations.length) {
    children.push(heading("Limitations", HeadingLevel.HEADING_2));
    for (const limitation of method.limitations) children.push(new Paragraph({ bullet: { level: 0 }, children: [text(limitation)] }));
  }
  children.push(para("Caudals reports evidence about observed behaviour on this test set. It is not a certification or a conformity assessment.", { color: MUTED, size: 18 }));

  const document = new Document({
    creator: "Caudals",
    title: `${clean(report.system.name)} — evaluation report`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [text(`Caudals · ${clean(report.system.name)} · revision ${report.report_revision_id.slice(0, 8)} · page `, { color: MUTED, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, color: MUTED, size: 16 })],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}
