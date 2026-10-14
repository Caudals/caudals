/**
 * "Send to my vendor" (launch P-54, spec §4.19): what a fix-list link shows.
 * The fix list ("Fix these first", P-18) and its evidence only: the answers
 * behind the three to five fixes, each with the question, the recorded
 * answer, the expected answer, why it was marked and the source excerpts.
 * No score, metrics, findings, methodology or any other result travels, and
 * none of the result's internal references (observation, source revisions,
 * grader) either.
 *
 * Browser-safe: the server projects the shared snapshot with it, and the
 * owner's dialog previews exactly what the vendor will see.
 */
import type { ReportSnapshot } from "./contracts";
import { buildFixes, type FixEvidence } from "./fixes";
import { FIX_LIST_SCOPE } from "./share-sections";

export type FixListShare = {
  scope: typeof FIX_LIST_SCOPE;
  report_revision_id: string;
  created_at: string;
  /** The system's name only: the vendor knows which assistant this is. */
  system: { name: string };
  /** Whether a person checked the grades (the evidence's status, not the report's). */
  review_status: ReportSnapshot["scope"]["review_status"];
  /** The answers behind the fixes, in report order. The fixes are rebuilt from them in the reader's language. */
  results: FixEvidence[];
};

type Snapshot = Pick<ReportSnapshot, "report_revision_id" | "created_at" | "system" | "scope" | "results">;

/**
 * The fix-list projection of a report. The fixes are grouped from every
 * result, then only their members are kept; grouping is per result, so the
 * same function on the kept results gives back the same fixes.
 */
export function projectFixList(report: Snapshot): FixListShare {
  const members = new Set(buildFixes(report.results).flatMap((fix) => fix.assessment_ids));
  return {
    scope: FIX_LIST_SCOPE,
    report_revision_id: report.report_revision_id,
    created_at: report.created_at,
    system: { name: report.system.name },
    review_status: report.scope.review_status,
    results: report.results.filter((result) => members.has(result.assessment_id)).map(evidence),
  };
}

/** One answer as evidence: an explicit allowlist of fields, so a new snapshot field never leaks by default. */
function evidence(result: ReportSnapshot["results"][number]): FixEvidence {
  return {
    assessment_id: result.assessment_id,
    case_revision_id: result.case_revision_id,
    title: result.title,
    topic: result.topic,
    severity: result.severity,
    outcome: result.outcome,
    input: result.input,
    output: result.output,
    rationale: result.rationale,
    ...(result.label ? { label: result.label } : {}),
    ...(result.expected ? { expected: result.expected } : {}),
    ...(result.failure_category ? { failure_category: result.failure_category } : {}),
    ...(result.likely_cause ? { likely_cause: result.likely_cause } : {}),
    ...(result.key_facts?.length ? { key_facts: result.key_facts.map((fact) => ({ fact: fact.fact, status: fact.status })) } : {}),
    ...(result.contradictions?.length ? { contradictions: [...result.contradictions] } : {}),
    ...(result.unsupported_claims?.length ? { unsupported_claims: [...result.unsupported_claims] } : {}),
    ...(result.source_excerpts?.length ? { source_excerpts: result.source_excerpts.map((excerpt) => ({ title: excerpt.title, excerpt: excerpt.excerpt })) } : {}),
  };
}

/** A fix-list link's data, as the shared page receives it. */
export function isFixListShare(value: unknown): value is FixListShare {
  return !!value && typeof value === "object" && (value as { scope?: unknown }).scope === FIX_LIST_SCOPE && Array.isArray((value as { results?: unknown }).results);
}
