import type { ResultLabel } from "./contracts";
import { offeredActions, turnAnswer, verdictOf, type FailureCategory, type VerdictRecord } from "../scoring/answer-judge";
import type { Observation } from "../contracts/results";

// Customer-facing projection of graded results (docs/evals/grading-engine.md):
// plain labels, the ground truth next to the answer, and findings grouped by
// why answers failed rather than by internal outcome codes.

type CaseDocument = {
  revision_id: string; title: string; task_type: string; tags: string[]; severity: "low" | "medium" | "high" | "critical"; language: string;
  scenario: { messages: Array<{ role: string; content: string }> };
  reference: { expected: unknown; required_claims: string[]; source_refs: Array<{ source_revision_id: string; anchor: string }>; graders: Array<{ kind: string; required?: string[] }> };
};
type AssessmentDocument = {
  outcome: "pass" | "partial" | "fail" | "unscorable"; rationale: string; review_status: string; grader_revision_id: string;
  evidence_refs: Array<{ source_revision_id: string; anchor: string }>; author: { kind: string }; extensions?: Record<string, unknown>;
};
export type ResultRow = { case_document: CaseDocument; observation_id: string; observation: Observation; assessment_id: string; assessment: AssessmentDocument; review_status: string };
export type ExcerptLookup = (ref: { source_revision_id: string; anchor: string }) => { title: string | null; excerpt: string } | null;

export function resultLabel(outcome: AssessmentDocument["outcome"], verdict: VerdictRecord | null, executionStatus: string): ResultLabel {
  if (outcome === "pass") return "correct";
  if (outcome === "partial") return "partially_correct";
  if (outcome === "fail") return verdict?.verdict === "not_answered" || verdict?.failure_category === "no_answer" ? "not_answered" : "incorrect";
  if (verdict?.reference_issue) return "test_issue";
  if (verdict?.capture_issue) return "capture_issue";
  if (executionStatus !== "succeeded") return "not_run";
  return "pending";
}

function expectedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}
function keyFacts(item: CaseDocument, verdict: VerdictRecord | null) {
  if (verdict?.key_facts?.length) return verdict.key_facts.slice(0, 20).map((fact) => ({ fact: fact.fact.slice(0, 500), status: fact.status }));
  const facts = item.reference.graders.flatMap((grader) => (grader.kind === "claims" ? grader.required ?? [] : []));
  const list = facts.length ? facts : item.reference.required_claims;
  const expected = expectedText(item.reference.expected).trim();
  // A single claim equal to the expected answer adds nothing to show.
  if (list.length === 1 && list[0].trim() === expected) return [];
  return [...new Set(list)].slice(0, 20).map((fact) => ({ fact: fact.slice(0, 500), status: null }));
}

export function buildResultDetail(row: ResultRow, excerpt: ExcerptLookup) {
  const item = row.case_document, assessment = row.assessment;
  const verdict = verdictOf(assessment);
  const refs = assessment.evidence_refs?.length ? assessment.evidence_refs : item.reference.source_refs;
  const excerpts = refs.slice(0, 2).flatMap((ref) => {
    const found = excerpt(ref);
    return found ? [{ source_revision_id: ref.source_revision_id, anchor: ref.anchor, title: found.title?.slice(0, 300) ?? null, excerpt: found.excerpt.slice(0, 1200) }] : [];
  });
  const gradedBy = assessment.author.kind === "human" ? "human" as const : verdict?.method ?? (assessment.extensions?.["caudals.evals/judge"] ? "judge" as const : "deterministic" as const);
  return {
    case_revision_id: item.revision_id,
    title: item.title,
    topic: item.tags[0] ?? item.task_type,
    severity: item.severity,
    outcome: assessment.outcome,
    assessment_id: row.assessment_id,
    observation_id: row.observation_id,
    input: item.scenario.messages.filter((message) => message.role === "user").map((message) => message.content).join("\n"),
    output: turnAnswer(row.observation),
    rationale: assessment.rationale,
    source_refs: assessment.evidence_refs,
    review_status: row.review_status,
    label: resultLabel(assessment.outcome, verdict, row.observation.status),
    expected: expectedText(item.reference.expected).slice(0, 8000),
    key_facts: keyFacts(item, verdict),
    source_excerpts: excerpts,
    failure_category: verdict?.failure_category ?? null,
    contradictions: (verdict?.contradictions ?? []).slice(0, 10).map((value) => value.slice(0, 400)),
    unsupported_claims: (verdict?.unsupported_claims ?? []).slice(0, 10).map((value) => value.slice(0, 400)),
    offered_actions: offeredActions(row.observation).map((value) => value.slice(0, 200)),
    graded_by: gradedBy,
    confidence: verdict?.confidence ?? null,
    language: (verdict?.language ?? item.language).slice(0, 40),
  };
}

/* ------------------------------------------------------------ findings --- */

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
type Severity = typeof SEVERITY_ORDER[number];
export const FINDING_COPY: Record<FailureCategory | "other", { title: string; observation: (n: number, d: number) => string; recommendation: string }> = {
  no_answer: {
    title: "The assistant did not answer",
    observation: (n, d) => `${n} of ${d} questions got no usable answer: the assistant deflected, asked to rephrase or offered options without answering.`,
    recommendation: "Check that these topics are covered by the assistant's knowledge and that its fallback does not trigger on clear, in-scope questions.",
  },
  wrong_information: {
    title: "Answers with wrong information",
    observation: (n, d) => `${n} of ${d} answers stated information that does not match your documentation.`,
    recommendation: "Correct or update the content the assistant relies on for these topics, then re-run the same tests to confirm the fix.",
  },
  contradicts_source: {
    title: "Answers that contradict your documentation",
    observation: (n, d) => `${n} of ${d} answers contradicted what your documentation says.`,
    recommendation: "Find the outdated or conflicting source the assistant used, remove or correct it, and re-run the same tests.",
  },
  missing_information: {
    title: "Incomplete answers",
    observation: (n, d) => `${n} of ${d} answers were right as far as they went but left out key facts.`,
    recommendation: "Make sure the complete information (conditions, limits, alternatives) is available to the assistant and that answers are not cut short.",
  },
  off_topic: {
    title: "Answers to a different question",
    observation: (n, d) => `${n} of ${d} answers addressed a different question than the one asked.`,
    recommendation: "Review how the assistant routes and retrieves content for these questions.",
  },
  other: {
    title: "Other failed answers",
    observation: (n, d) => `${n} of ${d} answers did not meet the expected answer.`,
    recommendation: "Inspect the linked answers, correct the system behaviour and re-run the same tests.",
  },
};

export function groupFindings(rows: Array<{ assessment_id: string; outcome: string; severity: Severity; failure_category: string | null }>) {
  const scored = rows.filter((row) => ["pass", "partial", "fail"].includes(row.outcome));
  const groups = new Map<keyof typeof FINDING_COPY, typeof rows>();
  for (const row of scored) {
    if (row.outcome === "pass") continue;
    const category = (row.failure_category && row.failure_category in FINDING_COPY ? row.failure_category
      : row.outcome === "partial" ? "missing_information" : "other") as keyof typeof FINDING_COPY;
    groups.set(category, [...(groups.get(category) ?? []), row]);
  }
  return [...groups].map(([category, members]) => {
    const severity = SEVERITY_ORDER.find((level) => members.some((member) => member.severity === level)) ?? "low";
    const copy = FINDING_COPY[category];
    return {
      category, severity, title: copy.title, frequency_n: members.length, frequency_denominator: scored.length,
      observation: copy.observation(members.length, scored.length), recommendation: copy.recommendation,
      assessment_ids: members.map((member) => member.assessment_id),
    };
  }).sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.frequency_n - a.frequency_n);
}

/** Limitations that explain results excluded from the score. */
export function exclusionLimitations(labels: ResultLabel[]): string[] {
  const tests = labels.filter((label) => label === "test_issue").length;
  const captures = labels.filter((label) => label === "capture_issue").length;
  return [
    ...(tests ? [`${tests} ${tests === 1 ? "test was" : "tests were"} flagged as unclear or with a questionable expected answer and excluded from the score until reviewed.`] : []),
    ...(captures ? [`${captures} ${captures === 1 ? "answer was" : "answers were"} not captured reliably from the web app and excluded from the score.`] : []),
  ];
}
