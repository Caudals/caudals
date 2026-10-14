/**
 * The executive summary (launch L-17, spec P-20): three plain sentences for a
 * business owner — how many answers matched the sources, the main problems
 * and where to start — with the sample size and the review status in the same
 * block. Built only from the report's structured metrics and results through
 * fixed templates (./summary-copy.ts); every sentence lists the result ids
 * behind it. The web report, the PDF and the Word document render this object
 * as it is, so the three formats say the same thing.
 */
import type { ExpertReviewLabel, ReportSnapshot } from "./contracts";
import type { ReportLocale } from "./i18n";
import { answerCount, buildFixes, isFailing, problemOf, type Fix, type FixProblem, FIX_PROBLEMS } from "./fixes";
import { fill, summaryCopy, wholePercent } from "./summary-copy";

/** "Reviewed by 2 experts on 13 October 2026, scope: …" — the label of an expert-reviewed revision (launch L-26). */
export function expertReviewLabel(label: Pick<ExpertReviewLabel, "reviewer_count" | "reviewed_on" | "scope">, locale: ReportLocale = "en"): string {
  const copy = summaryCopy(locale);
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(label.reviewed_on));
  return fill(label.reviewer_count === 1 ? copy.expertReviewedOne : copy.expertReviewedMany, { count: label.reviewer_count, date, scope: label.scope.trim().replace(/[.\s]+$/, "") });
}

export type SummarySentence = {
  key: "result" | "problems" | "start";
  text: string;
  /** The results behind the sentence. Empty only when the results were not shared with this copy. */
  assessment_ids: string[];
};
export type SummaryStatus = { key: "preliminary" | "reviewed" | "expert_reviewed" | "incomplete" | "complete"; label: string; text: string };
export type ExecutiveSummary = {
  title: string;
  /** Strict pass rate as a whole percentage (decimals stay in Methodology). */
  percent: number | null;
  percentText: string | null;
  pass: number;
  partial: number;
  scored: number;
  eligible: number;
  sentences: SummarySentence[];
  sample: string;
  status: SummaryStatus[];
  fixes: Fix[];
};
export type SummaryOptions = {
  /** The example evaluation: its review is simulated, and the status says so. */
  sample?: boolean;
};

type Report = Partial<Pick<ReportSnapshot, "metrics" | "results" | "scope" | "expert_review">>;

/**
 * Null when the copy carries no metrics (a share without them): nothing can be
 * said without the numbers.
 */
export function buildExecutiveSummary(report: Report, locale: ReportLocale = "en", options: SummaryOptions = {}): ExecutiveSummary | null {
  const m = report.metrics;
  if (!m) return null;
  const copy = summaryCopy(locale);
  const results = report.results ?? [];
  const withResults = results.length > 0;
  const ids = (filter: (item: (typeof results)[number]) => boolean) => results.filter(filter).map((item) => item.assessment_id);
  const percent = m.strict_pass_rate == null ? null : Math.round(m.strict_pass_rate * 100);
  const percentText = m.strict_pass_rate == null ? null : wholePercent(m.strict_pass_rate, locale);
  const sentences: SummarySentence[] = [];
  const fixes = withResults ? buildFixes(results, locale) : [];

  // 1. How many answers matched the sources.
  if (m.n_scorable > 0 && percentText) {
    const grounded = report.scope?.evidence_policy !== "exploratory";
    let text = fill(grounded ? copy.resultGrounded : copy.resultPlain, { pass: m.n_pass, scored: m.n_scorable, percent: percentText });
    if (m.n_partial > 0) text += ` ${m.n_partial === 1 ? copy.partialOne : fill(copy.partialMany, { partial: m.n_partial })}`;
    sentences.push({ key: "result", text, assessment_ids: ids((item) => item.outcome === "pass" || item.outcome === "partial") });
  } else {
    sentences.push({ key: "result", text: copy.resultNone, assessment_ids: ids(() => true) });
  }

  // 2. The main problems, by what went wrong (only when the results travel with the copy).
  if (withResults && m.n_scorable > 0) {
    const failing = results.filter(isFailing);
    if (failing.length) {
      const counts = new Map<FixProblem, string[]>();
      for (const item of failing) counts.set(problemOf(item), [...(counts.get(problemOf(item)) ?? []), item.assessment_id]);
      const top = [...counts].sort((a, b) => b[1].length - a[1].length || FIX_PROBLEMS.indexOf(a[0]) - FIX_PROBLEMS.indexOf(b[0])).slice(0, 2);
      const name = (problem: FixProblem) => copy[`problem_${problem}`];
      const text = top.length === 1
        ? fill(copy.problemsOne, { a: name(top[0][0]), n: top[0][1].length })
        : fill(copy.problemsTwo, { a: name(top[0][0]), n: top[0][1].length, b: name(top[1][0]), m: top[1][1].length });
      sentences.push({ key: "problems", text, assessment_ids: top.flatMap(([, members]) => members) });
    } else {
      sentences.push({ key: "problems", text: copy.problemsNone, assessment_ids: ids((item) => item.outcome === "pass") });
    }
  }

  // 3. Where to start: the first fix, or what to do when nothing failed or nothing was scored.
  if (withResults) {
    if (fixes.length) {
      const first = fixes[0];
      const critical = first.critical ? (first.critical === 1 ? copy.criticalSuffixOne : fill(copy.criticalSuffix, { n: first.critical })) : "";
      sentences.push({ key: "start", text: fill(copy.startFix, { fix: first.title, count: answerCount(first.assessment_ids.length, locale), critical }), assessment_ids: first.assessment_ids });
    } else if (m.n_scorable > 0) {
      sentences.push({ key: "start", text: copy.startRegression, assessment_ids: ids((item) => item.outcome !== "unscorable") });
    } else {
      sentences.push({ key: "start", text: copy.startUnscored, assessment_ids: ids((item) => item.outcome === "unscorable") });
    }
  }

  const status: SummaryStatus[] = [];
  const review = report.scope?.review_status;
  if (review === "preliminary") status.push({ key: "preliminary", label: copy.labelPreliminary, text: copy.statusPreliminary });
  if (review === "reviewed") status.push({ key: "reviewed", label: copy.labelReviewed, text: options.sample ? copy.statusReviewedSample : copy.statusReviewed });
  // The expert-review label (launch L-26): who reviewed what, recorded with the order (decision I-7).
  if (report.expert_review) status.push({ key: "expert_reviewed", label: copy.labelExpertReviewed, text: expertReviewLabel(report.expert_review, locale) });
  status.push(m.headline_status === "incomplete"
    ? { key: "incomplete", label: copy.labelIncomplete, text: copy.statusIncomplete }
    : { key: "complete", label: copy.labelComplete, text: copy.statusComplete });

  return {
    title: copy.summaryTitle,
    percent,
    percentText,
    pass: m.n_pass,
    partial: m.n_partial,
    scored: m.n_scorable,
    eligible: m.n_eligible,
    sentences,
    sample: fill(copy.sampleLine, { scored: m.n_scorable, eligible: m.n_eligible }),
    status,
    fixes,
  };
}
