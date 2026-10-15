/**
 * Readout mode (launch L-35, spec P-57): a report revision as a slide
 * sequence for a 20-minute live readout (spec §7.5): cover → verdict →
 * causes → five to seven transcripts → fixes → next step.
 *
 * Built only from the revision's snapshot, through the same builders as the
 * report: the verdict is the executive summary (`buildExecutiveSummary`), the
 * fixes are "Fix these first" (`buildFixes`), and the cause counts are the
 * report's "Why answers failed" and "Likely causes". The web view and the
 * 16:9 PDF render this object with one template (./readout-document.ts), so
 * every number on a slide is the report's number.
 *
 * Presenter notes are not part of the deck: they live in their own
 * operator-only table and never reach this builder, the PDF or a share.
 * Browser-safe.
 */
import type { ReportSnapshot } from "./contracts";
import { reportDate, reportLabel, type ReportLocale } from "./i18n";
import { answerCount, causeOf, isFailing, problemOf, type Fix, type FixCause, type FixProblem } from "./fixes";
import { buildExecutiveSummary, type SummarySentence, type SummaryStatus } from "./summary";
import { fill, wholePercent } from "./summary-copy";
import { readoutCopy, type ReadoutCopy } from "./readout-copy";

type Result = ReportSnapshot["results"][number];
type Severity = Result["severity"];

export const READOUT_MIN_TRANSCRIPTS = 5;
export const READOUT_MAX_TRANSCRIPTS = 7;
export const READOUT_NEXT_STEPS = ["pilot", "subscription"] as const;
export type ReadoutNextStep = (typeof READOUT_NEXT_STEPS)[number];
/** Slide keys a note can belong to: the fixed slides, and each transcript by its result id. */
export const READOUT_FIXED_KEYS = ["cover", "verdict", "causes", "fixes", "next"] as const;
export const READOUT_NOTE_KEY = /^(cover|verdict|causes|fixes|next|transcript:[A-Za-z0-9_.:-]{1,100})$/;
export const READOUT_NOTE_MAX = 4000;

const SEVERITY: readonly Severity[] = ["critical", "high", "medium", "low"];
const WEIGHT: Record<Severity, number> = { critical: 8, high: 4, medium: 2, low: 1 };
const OUTCOME_ORDER = ["fail", "partial", "unscorable", "pass"] as const;
const LABEL: Record<string, string> = {
  correct: "Correct", partially_correct: "Partly correct", incorrect: "Incorrect", not_answered: "No answer",
  test_issue: "Test needs review", capture_issue: "Not captured", not_run: "Not run", pending: "Not scored",
  pass: "Pass", partial: "Partial", fail: "Fail", unscorable: "Not scored",
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const TONE: Record<string, "pass" | "warn" | "fail" | "neutral"> = {
  pass: "pass", partial: "warn", fail: "fail", unscorable: "neutral", correct: "pass", partially_correct: "warn", incorrect: "fail", not_answered: "fail",
  test_issue: "neutral", capture_issue: "neutral", not_run: "neutral", pending: "neutral", critical: "fail", high: "fail", medium: "warn", low: "neutral",
};
const CATEGORIES = ["no_answer", "wrong_information", "missing_information", "contradicts_source", "off_topic"] as const;

/** Where a slide sits in the §7.5 script: minutes from the start of the readout. */
export type ReadoutSegment = { key: "context" | "failures" | "fixes" | "next"; from: number; to: number };
const SEGMENTS: Record<ReadoutSegment["key"], ReadoutSegment> = {
  context: { key: "context", from: 0, to: 2 },
  failures: { key: "failures", from: 2, to: 10 },
  fixes: { key: "fixes", from: 10, to: 15 },
  next: { key: "next", from: 15, to: 20 },
};

export type ReadoutChip = { text: string; tone: "pass" | "warn" | "fail" | "neutral" | "strong" };
export type ReadoutCount = { key: string; label: string; count: number; critical: number };
export type ReadoutText = { text: string; shortened: boolean };

export type ReadoutSlide =
  | { kind: "cover"; key: "cover"; system: string; purpose: ReadoutText; date: string; scope: string; status: SummaryStatus[] }
  | { kind: "verdict"; key: "verdict"; percentText: string | null; pass: number; scored: number; grounded: boolean; sentences: SummarySentence[]; sample: string; status: SummaryStatus[] }
  | { kind: "causes"; key: "causes"; scored: number; failing: number; causes: ReadoutCount[]; problems: ReadoutCount[] }
  | {
      kind: "transcript"; key: `transcript:${string}`; index: number; total: number;
      assessment_id: string; number: number; title: ReadoutText; chips: ReadoutChip[]; cause: string | null;
      question: ReadoutText; answer: ReadoutText; expected: ReadoutText | null; why: ReadoutText;
      excerpt: { title: string | null; text: ReadoutText } | null;
    }
  | { kind: "fixes"; key: "fixes"; fixes: Array<Pick<Fix, "rank" | "basis" | "critical" | "assessment_ids" | "severity"> & { title: ReadoutText; answers: string }> }
  | { kind: "next"; key: "next"; step: ReadoutNextStep; title: string; points: string[]; ask: string };
export type ReadoutSlideKind = ReadoutSlide["kind"];

export type ReadoutDeck = {
  locale: ReportLocale;
  revisionId: string;
  system: string;
  date: string;
  /** The example evaluation: every slide carries the "Example" label. */
  sample: boolean;
  nextStep: ReadoutNextStep;
  /** The transcripts shown, in order (result ids). */
  transcriptIds: string[];
  slides: ReadoutSlide[];
};

export type ReadoutOptions = {
  /** Operator picks saved for the revision; unknown ids are dropped, an empty list means the default. */
  transcriptIds?: readonly string[] | null;
  nextStep?: ReadoutNextStep | null;
  /** The workspace's plan, for the default next step. */
  plan?: string | null;
  sample?: boolean;
};

/** Managed workspaces (pilot customers) are pitched the subscription at delivery; everyone else a pilot (§7.5). */
export function defaultNextStep(plan: string | null | undefined): ReadoutNextStep {
  return plan === "managed" ? "subscription" : "pilot";
}

/** Cut long recorded text at a word boundary so a slide never overflows; the slide says when it did. */
export function clip(value: string | null | undefined, max: number): ReadoutText {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return { text, shortened: false };
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`, shortened: true };
}

/** The report's result numbers (T1, T2…): failures first, then by severity, as in the PDF and Word report. */
export function resultNumbers(results: readonly Result[]): Map<string, number> {
  const ordered = [...results].sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome) || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  return new Map(ordered.map((item, index) => [item.assessment_id, index + 1]));
}

/** The grouping key for "one transcript per cause": the likely cause, else what went wrong. */
function causeKey(result: Result): string {
  const cause = causeOf(result);
  return cause ? `cause:${cause}` : `problem:${problemOf(result)}`;
}
const bySeverity = (a: Result, b: Result) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome);

/**
 * The default transcripts: the most severe failure for each cause (causes
 * ranked like the fix list: severity weight, then size), then, while fewer
 * than five, the next most severe failures, then answers that passed. At most
 * seven. Answers that could not be scored are never shown by default.
 */
export function defaultTranscriptIds(results: readonly Result[]): string[] {
  const failing = results.filter(isFailing);
  const groups = new Map<string, Result[]>();
  for (const result of failing) groups.set(causeKey(result), [...(groups.get(causeKey(result)) ?? []), result]);
  const ranked = [...groups.entries()]
    .map(([key, members]) => ({ key, members: [...members].sort(bySeverity), weight: members.reduce((sum, item) => sum + WEIGHT[item.severity], 0) }))
    .sort((a, b) => b.weight - a.weight || b.members.length - a.members.length || bySeverity(a.members[0], b.members[0]) || a.key.localeCompare(b.key));
  const picks = ranked.slice(0, READOUT_MAX_TRANSCRIPTS).map((group) => group.members[0].assessment_id);
  const add = (pool: Result[]) => {
    for (const item of [...pool].sort(bySeverity)) {
      if (picks.length >= READOUT_MIN_TRANSCRIPTS) return;
      if (!picks.includes(item.assessment_id)) picks.push(item.assessment_id);
    }
  };
  add(failing);
  add(results.filter((item) => item.outcome === "pass"));
  return picks;
}

/** Operator picks that belong to this snapshot, deduplicated and capped; the default when none remain. */
export function resolveTranscriptIds(results: readonly Result[], picks: readonly string[] | null | undefined): string[] {
  const known = new Set(results.map((item) => item.assessment_id));
  const chosen = [...new Set((picks ?? []).filter((id) => known.has(id)))].slice(0, READOUT_MAX_TRANSCRIPTS);
  return chosen.length ? chosen : defaultTranscriptIds(results);
}

function counts(failing: readonly Result[], key: (item: Result) => string | null, label: (key: string) => string, order: readonly string[]): ReadoutCount[] {
  const rows = new Map<string, Result[]>();
  for (const item of failing) {
    const value = key(item);
    if (value) rows.set(value, [...(rows.get(value) ?? []), item]);
  }
  return [...rows]
    .map(([value, members]) => ({ key: value, label: label(value), count: members.length, critical: members.filter((item) => item.severity === "critical").length }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

/** A result label or severity as a slide chip: the report's own words and tone. */
export const readoutChip = (value: string, locale: ReportLocale): ReadoutChip => ({ text: reportLabel(LABEL[value] ?? value, locale), tone: TONE[value] ?? "neutral" });

function languagesText(languages: readonly string[], locale: ReportLocale) {
  const names = languages.map((code) => {
    try {
      return new Intl.DisplayNames([locale === "es" ? "es-ES" : "en-GB"], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  });
  const text = names.join(", ");
  return locale === "es" ? text.replace(/^./, (char) => char.toLocaleUpperCase("es")) : text;
}

/** The slide's place in the §7.5 script, for the presenter's timer. */
export function slideSegment(slide: Pick<ReadoutSlide, "kind">): ReadoutSegment {
  if (slide.kind === "cover" || slide.kind === "verdict") return SEGMENTS.context;
  if (slide.kind === "causes" || slide.kind === "transcript") return SEGMENTS.failures;
  if (slide.kind === "fixes") return SEGMENTS.fixes;
  return SEGMENTS.next;
}

/** The §7.5 script line for a slide: the presenter's note until an operator writes one. */
export function defaultNote(slide: Pick<ReadoutSlide, "kind">, locale: ReportLocale): string {
  const copy = readoutCopy(locale);
  return copy[`note_${slide.kind}` as keyof ReadoutCopy];
}

export function buildReadoutDeck(report: ReportSnapshot, locale: ReportLocale = "en", options: ReadoutOptions = {}): ReadoutDeck {
  const copy = readoutCopy(locale);
  const summary = buildExecutiveSummary(report, locale, { sample: options.sample })!;
  const m = report.metrics;
  const results = report.results;
  const numbers = resultNumbers(results);
  const byId = new Map(results.map((item) => [item.assessment_id, item]));
  const failing = results.filter(isFailing);
  const grounded = report.scope.evidence_policy !== "exploratory";
  const dates = reportDate(report.scope.started_at, locale) === reportDate(report.scope.finished_at, locale)
    ? reportDate(report.scope.started_at, locale)
    : `${reportDate(report.scope.started_at, locale)} – ${reportDate(report.scope.finished_at, locale)}`;
  const nextStep = options.nextStep ?? defaultNextStep(options.plan);
  const transcriptIds = resolveTranscriptIds(results, options.transcriptIds);
  const causeName = (cause: string) => copy[`cause_${cause}` as keyof ReadoutCopy] ?? cause;

  const slides: ReadoutSlide[] = [];
  slides.push({
    kind: "cover", key: "cover",
    system: clip(report.system.name, 100).text,
    purpose: clip(report.system.purpose, 200),
    date: dates,
    scope: fill(m.n_eligible === 1 ? (grounded ? copy.scopeLineOne : copy.scopeLineExploratoryOne) : (grounded ? copy.scopeLine : copy.scopeLineExploratory), { eligible: m.n_eligible, languages: languagesText(report.scope.languages, locale) }),
    status: summary.status,
  });
  slides.push({
    kind: "verdict", key: "verdict",
    percentText: m.strict_pass_rate == null ? null : wholePercent(m.strict_pass_rate, locale),
    pass: m.n_pass, scored: m.n_scorable, grounded,
    sentences: summary.sentences, sample: summary.sample, status: summary.status,
  });
  slides.push({
    kind: "causes", key: "causes", scored: m.n_scorable, failing: failing.length,
    // The report's "Likely causes": failed answers with a recorded cause.
    causes: counts(failing, (item) => causeOf(item), causeName, ["invented_answer", "outdated_document", "wrong_source", "knowledge_gap", "out_of_scope"] satisfies FixCause[]),
    // The report's "Why answers failed": every failed answer by what went wrong.
    problems: counts(
      failing,
      (item) => (item.failure_category && (CATEGORIES as readonly string[]).includes(item.failure_category) ? item.failure_category : item.outcome === "partial" ? "missing_information" : "other"),
      (key) => copy[`category_${key}` as keyof ReadoutCopy] ?? key,
      [...CATEGORIES, "other"] satisfies Array<FixProblem | "missing_information">,
    ),
  });
  transcriptIds.forEach((id, index) => {
    const item = byId.get(id)!;
    const excerpt = item.source_excerpts?.find((entry) => entry.excerpt.trim());
    const cause = causeOf(item);
    slides.push({
      kind: "transcript", key: `transcript:${id}`, index: index + 1, total: transcriptIds.length,
      assessment_id: id, number: numbers.get(id)!,
      title: clip(item.title, 90),
      chips: [readoutChip(item.label ?? item.outcome, locale), readoutChip(item.severity, locale)],
      cause: cause ? fill(copy.likelyCause, { cause: causeName(cause).toLocaleLowerCase(locale === "es" ? "es" : "en") }) : null,
      question: clip(item.input, 150),
      answer: clip(item.output, 320),
      expected: excerpt || !item.expected ? null : clip(item.expected, 220),
      why: clip(item.rationale, 150),
      excerpt: excerpt ? { title: excerpt.title?.trim() ? clip(excerpt.title, 70).text : null, text: clip(excerpt.excerpt, 200) } : null,
    });
  });
  slides.push({
    kind: "fixes", key: "fixes",
    fixes: summary.fixes.map((fix) => ({
      rank: fix.rank, basis: fix.basis, critical: fix.critical, assessment_ids: fix.assessment_ids, severity: fix.severity,
      title: clip(fix.title, 110),
      answers: answerCount(fix.assessment_ids.length, locale),
    })),
  });
  slides.push({
    kind: "next", key: "next", step: nextStep,
    title: copy[`next_${nextStep}_title`],
    points: [copy[`next_${nextStep}_1`], copy[`next_${nextStep}_2`], copy[`next_${nextStep}_3`]],
    ask: copy[`next_${nextStep}_ask`],
  });

  return { locale, revisionId: report.report_revision_id, system: report.system.name, date: dates, sample: !!options.sample, nextStep, transcriptIds, slides };
}
