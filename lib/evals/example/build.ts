/**
 * Builds the example evaluation fixtures from the bilingual source in
 * ./source. Node-only (content hashes use node:crypto): the generator script
 * writes the result to ./fixtures and the fixture test rebuilds it to prove
 * the committed JSON is current. Runtime code reads the JSON through ./index.ts.
 *
 * Metrics, intervals and the comparison come from the product's own scoring
 * code (aggregateRun, pairedComparison), so the example's numbers follow the
 * same rules as a real report.
 */
import { buildReportSnapshot, type ReportSnapshot, type ResultLabel } from "../reports/contracts";
import { exclusionLimitations, groupFindings } from "../reports/results";
import { localizeReportText } from "../reports/i18n";
import { aggregateRun, compareCompatibility, pairedComparison, type ComparisonPlan, type UnitOutcome } from "../scoring/aggregate";
import type { ExampleBundle, ExampleChange, ExampleLocale, ExampleTrendPoint } from "./bundle";
import { CASES_A } from "./source/cases-a";
import { CASES_B } from "./source/cases-b";
import { EXAMPLE_COMPANY, EXAMPLE_VERSION } from "./source/company";
import { EXAMPLE_DOCUMENTS } from "./source/documents";
import { EXAMPLE_FINDINGS, EXAMPLE_IMPROVEMENTS, EXAMPLE_METHODOLOGY, EXAMPLE_RUNS, EXAMPLE_SYSTEM, EXAMPLE_TAKEAWAYS } from "./source/report";
import type { ExampleCase, ExampleLabel, Text, TopicId, Variant } from "./source/types";

export const EXAMPLE_CASES: ExampleCase[] = [...CASES_A, ...CASES_B];

const TOPICS: Record<TopicId, Text> = {
  cover: { en: "cover", es: "coberturas" },
  exclusions: { en: "exclusions", es: "exclusiones" },
  excess: { en: "excess_and_limits", es: "franquicias_y_límites" },
  claims: { en: "claims", es: "siniestros" },
  payments: { en: "payments", es: "pagos" },
  changes: { en: "changes_and_cancellation", es: "cambios_y_bajas" },
  scope: { en: "out_of_scope", es: "fuera_de_alcance" },
};

const OUTCOME: Record<ExampleLabel, ReportSnapshot["results"][number]["outcome"]> = {
  correct: "pass",
  partially_correct: "partial",
  incorrect: "fail",
  not_answered: "fail",
  test_issue: "unscorable",
  capture_issue: "unscorable",
};

export const exampleIds = {
  run: (run: string) => `example-run-${run}`,
  report: (run: string) => `example-report-${run}`,
  case: (id: string) => `example-case-${id}-v1`,
  observation: (run: string, id: string) => `example-${run}-observation-${id}`,
  assessment: (run: string, id: string) => `example-${run}-assessment-${id}`,
  suite: "example-suite-home-v1",
  target: "example-target-website-v1",
};

/** Replace the company placeholders. */
function fill(value: string): string {
  return value.replaceAll("{co}", EXAMPLE_COMPANY.name).replaceAll("{product}", EXAMPLE_COMPANY.product);
}
const say = (text: Text, locale: ExampleLocale) => fill(text[locale]);

function variantFor(item: ExampleCase, runIndex: number): Variant {
  const variant = item.variants[item.runs[runIndex]];
  if (!variant) throw new Error(`example_variant_missing:${item.id}:${runIndex}`);
  if (variant.facts.length !== item.facts.length) throw new Error(`example_fact_count:${item.id}`);
  return variant;
}

function resultFor(item: ExampleCase, runIndex: number, locale: ExampleLocale): ReportSnapshot["results"][number] {
  const run = EXAMPLE_RUNS[runIndex].key, variant = variantFor(item, runIndex);
  const document = EXAMPLE_DOCUMENTS[item.source.doc], excerpt = document.anchors[item.source.anchor];
  if (!excerpt) throw new Error(`example_anchor_missing:${item.id}`);
  const reviewed = runIndex === EXAMPLE_RUNS.length - 1;
  return {
    case_revision_id: exampleIds.case(item.id),
    title: say(item.title, locale),
    topic: TOPICS[item.topic][locale],
    severity: item.severity,
    outcome: OUTCOME[variant.label],
    assessment_id: exampleIds.assessment(run, item.id),
    observation_id: exampleIds.observation(run, item.id),
    input: say(item.question, locale),
    output: say(variant.output, locale),
    rationale: say(variant.rationale, locale),
    source_refs: [{ source_revision_id: document.id, anchor: item.source.anchor }],
    review_status: reviewed ? "approved" : "unreviewed",
    label: variant.label,
    expected: say(item.expected, locale),
    key_facts: item.facts.map((fact, index) => ({ fact: say(fact, locale), status: variant.facts[index] })),
    source_excerpts: [{ source_revision_id: document.id, anchor: item.source.anchor, title: say(document.title, locale), excerpt: say(excerpt, locale) }],
    failure_category: variant.category ?? null,
    likely_cause: variant.cause ?? null,
    contradictions: (variant.contradictions ?? []).map((text) => say(text, locale)),
    unsupported_claims: (variant.unsupported ?? []).map((text) => say(text, locale)),
    confirmed_claims: [],
    offered_actions: (variant.offered ?? []).map((text) => say(text, locale)),
    graded_by: variant.gradedBy ?? "judge",
    confidence: variant.confidence ?? "high",
    language: locale,
  };
}

const localize = (text: string, locale: ExampleLocale) => localizeReportText(text, locale);

function buildRun(runIndex: number, locale: ExampleLocale): ReportSnapshot {
  const run = EXAMPLE_RUNS[runIndex], reviewed = runIndex === EXAMPLE_RUNS.length - 1;
  const results = EXAMPLE_CASES.map((item) => resultFor(item, runIndex, locale));
  const byCase = new Map(results.map((result) => [result.case_revision_id, result]));
  const assessment = (caseId: string) => {
    const result = byCase.get(exampleIds.case(caseId));
    if (!result) throw new Error(`example_case_missing:${caseId}`);
    return result.assessment_id;
  };
  const units: UnitOutcome[] = EXAMPLE_CASES.map((item, index) => ({ id: exampleIds.case(item.id), familyId: item.id, eligible: true, executionStatus: "succeeded", outcome: results[index].outcome, severity: item.severity }));
  const metrics = aggregateRun(units);
  const scorable = (keep: (item: ExampleCase) => boolean) => EXAMPLE_CASES.filter((item) => keep(item) && OUTCOME[variantFor(item, runIndex).label] !== "unscorable").length;

  let findings: ReportSnapshot["findings"], improvements: ReportSnapshot["improvements"], takeaways: ReportSnapshot["takeaways"];
  if (reviewed) {
    findings = EXAMPLE_FINDINGS.map((finding) => ({
      id: finding.id,
      title: say(finding.title, locale),
      severity: finding.severity,
      evidence_strength: "reviewed",
      frequency_n: finding.cases.length,
      frequency_denominator: "topic" in finding.denominator ? scorable((item) => item.topic === (finding.denominator as { topic: string }).topic) : finding.denominator.cases.length,
      observation: say(finding.observation, locale),
      cause_hypothesis: say(finding.cause, locale),
      recommendation: say(finding.recommendation, locale),
      assessment_ids: finding.cases.map(assessment),
    }));
    improvements = EXAMPLE_IMPROVEMENTS.map((item, index) => ({ id: item.id, priority: index + 1, title: say(item.title, locale), owner: say(item.owner, locale), status: item.status, finding_ids: item.findings, validation_plan: say(item.plan, locale) }));
    takeaways = EXAMPLE_TAKEAWAYS.map((item) => ({ text: say(item.text, locale), finding_ids: item.findings, assessment_ids: item.cases.map(assessment) }));
  } else {
    // The monthly re-runs carry the automatic findings the product writes for an unreviewed run.
    const grouped = groupFindings(results.map((result) => ({ assessment_id: result.assessment_id, outcome: result.outcome, severity: result.severity, failure_category: result.failure_category ?? null, likely_cause: result.likely_cause ?? null })));
    findings = grouped.map((finding) => ({
      id: `example-${run.key}-finding-${finding.category}`,
      title: localize(finding.title, locale),
      severity: finding.severity,
      evidence_strength: "source_supported",
      frequency_n: finding.frequency_n,
      frequency_denominator: finding.frequency_denominator,
      observation: localize(finding.observation, locale),
      cause_hypothesis: finding.cause_hypothesis ? localize(finding.cause_hypothesis, locale) : null,
      recommendation: localize(finding.recommendation, locale),
      assessment_ids: finding.assessment_ids,
    }));
    improvements = findings.map((finding, index) => ({ id: `example-${run.key}-improvement-${index + 1}`, priority: index + 1, title: finding.recommendation, owner: null, status: "proposed" as const, finding_ids: [finding.id], validation_plan: localize("Apply the supported change and rerun the same frozen case revisions.", locale) }));
    takeaways = findings.slice(0, 5).map((finding) => ({ text: localize(`${finding.title}: ${finding.frequency_n} of ${finding.frequency_denominator} relevant assessed results.`, locale), finding_ids: [finding.id], assessment_ids: finding.assessment_ids }));
  }

  const labels = results.map((result) => result.label as ResultLabel);
  return buildReportSnapshot({
    schema_version: "1.0",
    report_revision_id: exampleIds.report(run.key),
    run_id: exampleIds.run(run.key),
    created_at: run.reported,
    system: { name: say(EXAMPLE_SYSTEM.name, locale), target_revision_id: exampleIds.target, purpose: say(EXAMPLE_SYSTEM.purpose, locale), execution_mode: "deployed_system" },
    scope: { suite_version_id: exampleIds.suite, evidence_policy: "source_grounded", started_at: run.started, finished_at: run.finished, languages: [locale], review_status: reviewed ? "reviewed" : "preliminary" },
    metrics,
    findings,
    results,
    improvements,
    methodology: {
      cef_version: "1.0",
      scorer_version: "grading-v2",
      grader_revisions: ["example-answer-judge-v2"],
      rubric_revisions: [],
      source_revisions: Object.values(EXAMPLE_DOCUMENTS).map((document) => document.id),
      sampling: say(EXAMPLE_METHODOLOGY.sampling, locale),
      exclusions: [],
      review_coverage: reviewed ? say(EXAMPLE_METHODOLOGY.reviewCoverage, locale) : localize("Automated preliminary assessment; critical and disputed results require review.", locale),
      cost: null,
      limitations: [...EXAMPLE_METHODOLOGY.limitations.map((text) => say(text, locale)), ...exclusionLimitations(labels).map((text) => localize(text, locale))],
    },
    takeaways,
  });
}

function trendPoint(report: ReportSnapshot): ExampleTrendPoint {
  const m = report.metrics;
  return {
    run_id: report.run_id,
    report_revision_id: report.report_revision_id,
    started_at: report.scope.started_at,
    finished_at: report.scope.finished_at,
    review_status: report.scope.review_status,
    strict_pass_rate: m.strict_pass_rate,
    n_scorable: m.n_scorable,
    n_pass: m.n_pass,
    n_partial: m.n_partial,
    n_fail: m.n_fail,
    n_unscorable: m.n_unscorable,
    critical_failures: report.results.filter((item) => item.severity === "critical" && (item.outcome === "fail" || item.outcome === "partial")).length,
  };
}

/** The September → October comparison, paired on the same frozen test set. */
function compare(baseline: ReportSnapshot, candidate: ReportSnapshot) {
  const plan = (report: ReportSnapshot): ComparisonPlan => ({ suiteVersionId: report.scope.suite_version_id, caseRevisions: report.results.map((item) => ({ revisionId: item.case_revision_id, familyId: item.case_revision_id })), rubricHashes: [], scorerVersion: report.methodology.scorer_version, candidateContextHash: "example", toolFixtureHashes: [], repetitionPolicy: "one", executionConditionsHash: "example" });
  const outcomes = (report: ReportSnapshot) => new Map(report.results.map((item) => [item.case_revision_id, item.outcome]));
  const result = pairedComparison({ baseline: outcomes(baseline), candidate: outcomes(candidate), compatibility: compareCompatibility(plan(baseline), plan(candidate)) });
  if (result.status === "incompatible") throw new Error("example_comparison_incompatible");
  const rank = { fail: 0, partial: 1, pass: 2 } as const;
  const before = new Map(baseline.results.map((item) => [item.case_revision_id, item]));
  const changes: ExampleChange[] = [];
  for (const item of candidate.results) {
    const previous = before.get(item.case_revision_id);
    if (!previous || previous.outcome === "unscorable" || item.outcome === "unscorable" || previous.outcome === item.outcome) continue;
    changes.push({ case_revision_id: item.case_revision_id, title: item.title, assessment_id: item.assessment_id, direction: rank[item.outcome] > rank[previous.outcome] ? "improved" : "regressed", before: previous.label!, after: item.label! });
  }
  changes.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "regressed" ? -1 : 1));
  return {
    baseline_run_id: baseline.run_id,
    candidate_run_id: candidate.run_id,
    baseline_started_at: baseline.scope.started_at,
    candidate_started_at: candidate.scope.started_at,
    status: result.status,
    improved: result.improved,
    regressed: result.regressed,
    unchanged: result.unchanged,
    unassessed: result.unassessed,
    changes,
  };
}

export function buildExampleBundle(locale: ExampleLocale): ExampleBundle {
  const runs = [buildRun(0, locale), buildRun(1, locale), buildRun(2, locale)] as [ReportSnapshot, ReportSnapshot, ReportSnapshot];
  return {
    schema: "caudals.example/1",
    version: EXAMPLE_VERSION,
    locale,
    company: { ...EXAMPLE_COMPANY },
    sources: Object.values(EXAMPLE_DOCUMENTS).map((document) => ({ id: document.id, title: say(document.title, locale) })),
    runs,
    trend: runs.map(trendPoint),
    comparison: compare(runs[1], runs[2]),
  };
}
