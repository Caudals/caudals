/**
 * What changed between two runs of the same test set, in words a person
 * reads (launch L-18, spec v2 P-19, P-25): the score of each run, the
 * questions that got worse ("newly broken") and better, and whether the two
 * runs can be compared at all. Used by the regression summary after each
 * scheduled run and by "Run again" → the comparison that opens on its own.
 *
 * Pairing follows compareRuns (lib/evals/repositories/managed.ts): the latest
 * assessment of each case revision, compared on the pass > partial > fail
 * order; unscorable or missing answers are not paired. Compatibility is the
 * engine's own (compareCompatibility): another test set, rubric, grader,
 * candidate context, tool fixtures, repetitions or execution conditions make
 * two runs not comparable, and then no regression is ever reported.
 *
 * No React and no "server-only": the scheduler imports it.
 */
import type { PoolClient } from "pg";
import { compareCompatibility, normalizeComparisonPlan, pairedComparison } from "../scoring/aggregate";

export type Outcome = "pass" | "partial" | "fail" | "unscorable";
export type OutcomeRow = { caseRevisionId: string; title: string; severity: string; outcome: Outcome | null; assessmentId: string | null };
export type ChangedQuestion = { caseRevisionId: string; title: string; severity: string; before: Outcome; after: Outcome; assessmentId: string | null; baselineAssessmentId: string | null };
export type Score = { pass: number; scored: number };

const RANK: Record<"pass" | "partial" | "fail", number> = { fail: 0, partial: 1, pass: 2 };
const SEVERITY = ["critical", "high", "medium", "low"];
/** At most this many newly broken questions in an alert (P-25). */
export const ALERT_BROKEN_LIMIT = 5;

/** The score of a run: strict pass rate over scorable answers (the report's headline). */
export function scoreOf(rows: OutcomeRow[]): Score {
  const scored = rows.filter(row => row.outcome && row.outcome !== "unscorable");
  return { pass: scored.filter(row => row.outcome === "pass").length, scored: scored.length };
}

/** The last row per case revision, as compareRuns pairs them. */
function byCase(rows: OutcomeRow[]) {
  const map = new Map<string, OutcomeRow>();
  for (const row of rows) map.set(row.caseRevisionId, row);
  return map;
}

/**
 * The questions whose result moved between two runs: newly broken (lower on
 * pass > partial > fail) and fixed (higher), most severe first, then by title.
 */
export function changedQuestions(baseline: OutcomeRow[], candidate: OutcomeRow[]) {
  const before = byCase(baseline), after = byCase(candidate);
  const broken: ChangedQuestion[] = [], fixed: ChangedQuestion[] = [];
  for (const [id, now] of after) {
    const then = before.get(id);
    if (!then?.outcome || !now.outcome || then.outcome === "unscorable" || now.outcome === "unscorable") continue;
    const change: ChangedQuestion = { caseRevisionId: id, title: now.title || then.title, severity: now.severity, before: then.outcome, after: now.outcome,
      assessmentId: now.assessmentId, baselineAssessmentId: then.assessmentId };
    if (RANK[now.outcome] < RANK[then.outcome]) broken.push(change);
    else if (RANK[now.outcome] > RANK[then.outcome]) fixed.push(change);
  }
  const order = (a: ChangedQuestion, b: ChangedQuestion) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || a.title.localeCompare(b.title) || a.caseRevisionId.localeCompare(b.caseRevisionId);
  return { broken: broken.sort(order), fixed: fixed.sort(order) };
}

/** Each case unit's latest assessment, with the question's title and severity. */
export async function runOutcomeRows(db: PoolClient, orgId: string, runId: string): Promise<OutcomeRow[]> {
  return (await db.query(`SELECT cu.case_revision_id::text AS case_revision_id, cr.document->>'title' AS title, cr.document->>'severity' AS severity,
      a.id::text AS assessment_id, a.document->>'outcome' AS outcome
    FROM evals.case_unit cu JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
    LEFT JOIN evals.observation o ON (o.org_id,o.case_unit_id)=(cu.org_id,cu.id)
    LEFT JOIN LATERAL (SELECT x.id,x.document FROM evals.assessment x WHERE (x.org_id,x.observation_id)=(o.org_id,o.id) ORDER BY x.created_at DESC,x.id DESC LIMIT 1) a ON true
    WHERE cu.org_id=$1 AND cu.run_id=$2 ORDER BY cu.created_at,cu.id`, [orgId, runId])).rows.map(row => ({
    caseRevisionId: String(row.case_revision_id), title: String(row.title ?? ""), severity: String(row.severity ?? "medium"),
    outcome: (row.outcome ?? null) as Outcome | null, assessmentId: row.assessment_id ? String(row.assessment_id) : null,
  }));
}

/** The workspace's live report for a run (its latest revision), if any. */
export async function reportForRun(db: PoolClient, orgId: string, runId: string): Promise<string | null> {
  const row = (await db.query(`SELECT rr.report_id FROM evals.report_revision rr JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id)
    WHERE rr.org_id=$1 AND rr.run_id=$2 AND r.archived_at IS NULL ORDER BY rr.created_at DESC,rr.id DESC LIMIT 1`, [orgId, runId])).rows[0];
  return row ? String(row.report_id) : null;
}

/** Whether two runs can be compared (same frozen test set, rubric, grader and conditions), with the engine's counts. */
export async function runCompatibility(db: PoolClient, orgId: string, baselineRunId: string, candidateRunId: string) {
  const plans = (await db.query("SELECT run_id::text AS run_id,document FROM evals.run_plan WHERE org_id=$1 AND run_id=ANY($2::uuid[])", [orgId, [baselineRunId, candidateRunId]])).rows;
  const plan = (id: string) => plans.find(row => row.run_id === id)?.document as Record<string, unknown> | undefined;
  const a = plan(baselineRunId), b = plan(candidateRunId);
  if (!a || !b) return null;
  return compareCompatibility(normalizeComparisonPlan(a), normalizeComparisonPlan(b));
}

/** The comparison counts for two runs' outcome rows (pairedComparison's numbers, computed without storing a comparison). */
export function pairedCounts(compatibility: NonNullable<Awaited<ReturnType<typeof runCompatibility>>>, baseline: OutcomeRow[], candidate: OutcomeRow[]) {
  const outcomes = (rows: OutcomeRow[]) => new Map([...byCase(rows)].map(([id, row]) => [id, row.outcome ?? undefined]));
  return pairedComparison({ baseline: outcomes(baseline), candidate: outcomes(candidate), compatibility });
}

/* ------------------------------------------------------- run summary --- */

/** The summary of one scheduled run, sent to every destination (lib/evals/monitoring/destinations.ts). */
export type MonitoringSummary = {
  version: 1;
  status: "pass" | "regression" | "inconclusive" | "unknown";
  /** False when the test sets (or rubric, grader, conditions) differ, or there is no earlier run to compare with. */
  comparable: boolean;
  reasons: string[];
  evaluation: { id: string; title: string };
  scheduleId: string;
  dispatchId: string;
  scheduledFor: string;
  candidate: { runId: string; reportId: string | null; score: Score };
  baseline: { runId: string; reportId: string | null; score: Score } | null;
  /** Newly broken questions, most severe first, at most five. */
  newlyBroken: ChangedQuestion[];
  newlyBrokenTotal: number;
  fixedTotal: number;
};

export function buildMonitoringSummary(input: {
  status: MonitoringSummary["status"]; reasons: string[]; compatible: boolean | null;
  evaluation: { id: string; title: string }; scheduleId: string; dispatchId: string; scheduledFor: string;
  candidate: { runId: string; reportId: string | null; rows: OutcomeRow[] };
  baseline: { runId: string; reportId: string | null; rows: OutcomeRow[] } | null;
}): MonitoringSummary {
  const comparable = !!input.baseline && input.compatible === true;
  const changes = comparable ? changedQuestions(input.baseline!.rows, input.candidate.rows) : { broken: [], fixed: [] };
  return {
    version: 1, status: input.status, comparable, reasons: input.reasons,
    evaluation: input.evaluation, scheduleId: input.scheduleId, dispatchId: input.dispatchId, scheduledFor: input.scheduledFor,
    candidate: { runId: input.candidate.runId, reportId: input.candidate.reportId, score: scoreOf(input.candidate.rows) },
    baseline: input.baseline ? { runId: input.baseline.runId, reportId: input.baseline.reportId, score: scoreOf(input.baseline.rows) } : null,
    newlyBroken: changes.broken.slice(0, ALERT_BROKEN_LIMIT), newlyBrokenTotal: changes.broken.length, fixedTotal: changes.fixed.length,
  };
}
