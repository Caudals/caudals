/**
 * "Fix these first" (launch L-17, spec P-18): the three to five changes that
 * matter most, built only from a report's structured results. Failed and
 * partly correct answers are grouped by likely cause (else by what went
 * wrong) and by the source page their evidence cites, then ranked by severity
 * and size. Every fix carries the result ids behind it.
 *
 * Causes are the grader's hypotheses; the copy labels them so. Browser-safe:
 * the web report, the PDF and the Word document all call this.
 */
import type { ReportSnapshot } from "./contracts";
import type { ReportLocale } from "./i18n";
import { fill, summaryCopy, type SummaryCopy } from "./summary-copy";

type Result = ReportSnapshot["results"][number];
type Severity = Result["severity"];
/**
 * What a fix list reads from a result. A full report result has all of it;
 * the vendor's fix-list share (launch P-54) carries only these fields.
 */
export type FixEvidence = Pick<Result, "assessment_id" | "case_revision_id" | "title" | "topic" | "severity" | "outcome" | "input" | "output" | "rationale">
  & Partial<Pick<Result, "label" | "expected" | "failure_category" | "likely_cause" | "key_facts" | "contradictions" | "unsupported_claims">>
  & { source_excerpts?: ReadonlyArray<{ title: string | null; excerpt: string }> };
export const FIX_LIMIT = 5;
const SEVERITY: readonly Severity[] = ["critical", "high", "medium", "low"];
const WEIGHT: Record<Severity, number> = { critical: 8, high: 4, medium: 2, low: 1 };
export const FIX_CAUSES = ["invented_answer", "outdated_document", "wrong_source", "knowledge_gap", "out_of_scope"] as const;
export const FIX_PROBLEMS = ["no_answer", "wrong_information", "contradicts_source", "missing_information", "off_topic", "other"] as const;
export type FixCause = (typeof FIX_CAUSES)[number];
export type FixProblem = (typeof FIX_PROBLEMS)[number];

export type Fix = {
  /** Stable within a report: cause or problem, then the source title. */
  id: string;
  rank: number;
  /** The likely cause (a hypothesis) when results record one; otherwise null. */
  cause: FixCause | null;
  /** What went wrong, from the results' failure category. */
  problem: FixProblem;
  /** Title of the source page the evidence cites, as recorded. */
  source: string | null;
  severity: Severity;
  critical: number;
  assessment_ids: string[];
  title: string;
  action: string;
  /** "Likely cause (hypothesis): …" or "What went wrong: …". */
  basis: string;
};

/** Failed and partly correct answers: what a fix list is made of. */
export function isFailing(result: Pick<Result, "outcome">) {
  return result.outcome === "fail" || result.outcome === "partial";
}

export function problemOf(result: Pick<Result, "outcome"> & { failure_category?: string | null }): FixProblem {
  const category = result.failure_category ?? "";
  if ((FIX_PROBLEMS as readonly string[]).includes(category) && category !== "other") return category as FixProblem;
  return result.outcome === "partial" ? "missing_information" : "other";
}
export function causeOf(result: { likely_cause?: string | null }): FixCause | null {
  const cause = result.likely_cause ?? "";
  return (FIX_CAUSES as readonly string[]).includes(cause) ? (cause as FixCause) : null;
}
/** The source page a result's evidence cites: the first excerpt's title, if any. */
export function sourceOf(result: { source_excerpts?: ReadonlyArray<{ title: string | null }> }): string | null {
  const title = result.source_excerpts?.find((excerpt) => excerpt.title?.trim())?.title?.trim();
  return title ? title.slice(0, 160) : null;
}

function fixTitle(copy: SummaryCopy, key: FixCause | FixProblem, source: string | null) {
  const template = source ? copy[`title_${key}` as keyof SummaryCopy] : copy[`title_${key}_none` as keyof SummaryCopy];
  return fill(template, { source: source ?? "" });
}

/**
 * The ranked fix list. Groups are ranked by the sum of their answers'
 * severity weights, then by size, then by the most severe answer; ties keep a
 * deterministic order so every format lists the same fixes.
 */
export function buildFixes(results: readonly FixEvidence[], locale: ReportLocale = "en", limit = FIX_LIMIT): Fix[] {
  const copy = summaryCopy(locale);
  type Group = { cause: FixCause | null; problems: Map<FixProblem, number>; source: string | null; members: FixEvidence[] };
  const groups = new Map<string, Group>();
  for (const result of results) {
    if (!isFailing(result)) continue;
    const cause = causeOf(result), problem = problemOf(result), source = sourceOf(result);
    const id = `${cause ?? problem}|${source ?? ""}`;
    const group: Group = groups.get(id) ?? { cause, problems: new Map(), source, members: [] };
    group.members.push(result);
    group.problems.set(problem, (group.problems.get(problem) ?? 0) + 1);
    groups.set(id, group);
  }
  const ranked = [...groups.entries()]
    .map(([id, group]) => {
      const weight = group.members.reduce((sum, item) => sum + WEIGHT[item.severity], 0);
      const severity = SEVERITY.find((level) => group.members.some((item) => item.severity === level)) ?? "low";
      // The most frequent problem in the group, ties broken by the fixed order.
      const problem = [...group.problems].sort((a, b) => b[1] - a[1] || FIX_PROBLEMS.indexOf(a[0]) - FIX_PROBLEMS.indexOf(b[0]))[0][0];
      return { id, group, weight, severity, problem };
    })
    .sort((a, b) => b.weight - a.weight || b.group.members.length - a.group.members.length || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || a.id.localeCompare(b.id));
  return ranked.slice(0, Math.max(0, limit)).map(({ id, group, severity, problem }, index) => {
    const key = group.cause ?? problem;
    return {
      id,
      rank: index + 1,
      cause: group.cause,
      problem,
      source: group.source,
      severity,
      critical: group.members.filter((item) => item.severity === "critical").length,
      assessment_ids: group.members.map((item) => item.assessment_id),
      title: fixTitle(copy, key, group.source),
      action: copy[`action_${key}` as keyof SummaryCopy],
      basis: group.cause ? fill(copy.fixCause, { cause: copy[`cause_${group.cause}` as keyof SummaryCopy] }) : fill(copy.fixSymptom, { problem: copy[`problem_${problem}` as keyof SummaryCopy] }),
    };
  });
}

/** "3 answers", "1 respuesta". */
export function answerCount(n: number, locale: ReportLocale) {
  const copy = summaryCopy(locale);
  return n === 1 ? copy.fixAnswersOne : fill(copy.fixAnswersMany, { n });
}

/** Result numbers as compact references: "T1–T4, T9". Used by the PDF and the Word document. */
export function testRefs(ids: readonly string[], number: ReadonlyMap<string, number>): string {
  const values = [...new Set(ids.map((id) => number.get(id)).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < values.length; index++) {
    const start = values[index];
    while (index + 1 < values.length && values[index + 1] === values[index] + 1) index++;
    const end = values[index];
    parts.push(end - start >= 2 ? `T${start}–T${end}` : start === end ? `T${start}` : `T${start}, T${end}`);
  }
  return parts.join(", ");
}

/* -------------------------------------------------------------- exports --- */

/** A CSV cell that a spreadsheet will not run as a formula. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
function csv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const resultIndex = <T extends FixEvidence>(results: readonly T[]) => new Map(results.map((item) => [item.assessment_id, item]));

/**
 * The fix list for a vendor as CSV: one row per answer, with its fix. Columns
 * stay in English so a spreadsheet keeps the same shape in every language.
 */
export function fixesCsv(results: readonly FixEvidence[], fixes: readonly Fix[]): string {
  const byId = resultIndex(results);
  const header = ["fix", "fix_title", "likely_cause_hypothesis", "problem", "source", "severity", "what_to_do", "result", "question", "answer", "expected_answer", "why", "assessment_id", "case_revision_id"];
  const rows = fixes.flatMap((fix) =>
    fix.assessment_ids.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      return [[String(fix.rank), fix.title, fix.cause ?? "", fix.problem, fix.source ?? "", item.severity, fix.action, item.label ?? item.outcome, item.input, item.output, item.expected ?? "", item.rationale, item.assessment_id, item.case_revision_id]];
    }),
  );
  return csv([header, ...rows]);
}

/** Failed and partly correct answers as CSV (the results tab's "Export failing"). */
export function failingCsv(results: readonly Result[]): string {
  const header = ["result", "severity", "topic", "question", "answer", "expected_answer", "why", "failure_category", "likely_cause_hypothesis", "source", "assessment_id", "case_revision_id"];
  const rows = results.filter(isFailing).map((item) => [item.label ?? item.outcome, item.severity, item.topic, item.input, item.output, item.expected ?? "", item.rationale, item.failure_category ?? "", item.likely_cause ?? "", sourceOf(item) ?? "", item.assessment_id, item.case_revision_id]);
  return csv([header, ...rows]);
}

/** A quoted block of recorded text; HTML, links and code spans are escaped so a Markdown viewer shows them as text. */
const quote = (value: string) => value.trim().replace(/([\\`<>[\]])/g, "\\$1").split(/\r?\n/).map((line) => `> ${line}`).join("\n");
/** Markdown leaves no room for the reader to run anything: escape what Markdown would interpret. */
const inline = (value: string) => value.replace(/\s+/g, " ").replace(/([\\`*_[\]<>#|])/g, "\\$1").trim();

/** The fix list for a vendor as Markdown: each fix, what to do, and its evidence. */
export function fixesMarkdown(report: { system?: { name: string }; created_at?: string; results: readonly FixEvidence[] }, fixes: readonly Fix[], locale: ReportLocale = "en", date = ""): string {
  const copy = summaryCopy(locale);
  const byId = resultIndex(report.results);
  const lines = [`# ${copy.markdownTitle}${report.system?.name ? ` — ${inline(report.system.name)}` : ""}`, "", fill(copy.markdownIntro, { system: report.system?.name ? inline(report.system.name) : "—", date }), ""];
  if (!fixes.length) lines.push(copy.fixesNone, "");
  for (const fix of fixes) {
    lines.push(`## ${fix.rank}. ${inline(fix.title)}`, "");
    lines.push(`- ${inline(fix.basis)}`);
    lines.push(`- ${fix.source ? inline(fill(copy.fixSource, { source: fix.source })) : copy.fixNoSource}`);
    lines.push(`- ${answerCount(fix.assessment_ids.length, locale)}${fix.critical ? (fix.critical === 1 ? copy.criticalSuffixOne : fill(copy.criticalSuffix, { n: fix.critical })) : ""}`);
    lines.push(`- **${copy.fixDo}:** ${inline(fix.action)}`, "");
    for (const id of fix.assessment_ids) {
      const item = byId.get(id);
      if (!item) continue;
      lines.push(`### ${copy.markdownQuestion}: ${inline(item.input || item.title)}`, "");
      lines.push(`**${copy.markdownAnswer}:**`, "", quote(item.output || "—"), "");
      if (item.expected) lines.push(`**${copy.markdownExpected}:**`, "", quote(item.expected), "");
      if (item.rationale) lines.push(`**${copy.markdownWhy}:** ${inline(item.rationale)}`, "");
      const excerpt = item.source_excerpts?.[0];
      if (excerpt) lines.push(`**${copy.markdownFromSource}${excerpt.title ? ` (${inline(excerpt.title)})` : ""}:**`, "", quote(excerpt.excerpt), "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
