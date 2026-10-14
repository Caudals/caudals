import "server-only";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import { withTenant } from "../repositories/db";
import type { EvidenceScope } from "../repositories/evidence";
import { changedQuestions, pairedCounts, reportForRun, runCompatibility, runOutcomeRows, scoreOf } from "./summary";

/**
 * "Run again" → the comparison that opens on its own (launch L-18, spec v2
 * P-19): a run against the previous finished run of the same evaluation (or
 * a run the person picks), with improved / regressed / unchanged counts and
 * the questions that moved. Read-only: nothing is stored (an explicit
 * comparison is still recorded by POST /comparisons, and every scheduled
 * run's by its alert).
 */
export const runComparisonQuery = z.strictObject({
  orgId: z.uuid(),
  baselineRunId: z.uuid().optional(),
  /** "Re-run these questions" (L-17's fixes): their results before and after, listed first. */
  focus: z.array(z.uuid()).max(50).optional(),
});

/** At most this many changed questions are listed (the counts are always complete). */
const CHANGES_LIMIT = 50;

type RunRow = { id: string; evaluation_id: string; suite_version_id: string; status: string; created_at: Date };

export function runComparison(scope: EvidenceScope, runId: string, baselineRunId?: string, focusIds: string[] = []) {
  return withTenant(scope, async db => {
    const run = (await db.query("SELECT id,evaluation_id,suite_version_id,status,created_at FROM evals.run WHERE org_id=$1 AND id=$2", [scope.orgId, runId])).rows[0] as RunRow | undefined;
    if (!run) throw new EvalError("SCOPE_DENIED", 404);
    // The previous finished run of the evaluation: same test set first, then any.
    const baseline = (baselineRunId
      ? (await db.query(`SELECT r.id,r.evaluation_id,r.suite_version_id,r.status,r.created_at FROM evals.run r JOIN evals.evaluation a ON (a.org_id,a.id)=(r.org_id,r.evaluation_id)
          JOIN evals.evaluation b ON b.org_id=r.org_id AND b.id=$3 WHERE r.org_id=$1 AND r.id=$2 AND a.project_id=b.project_id`, [scope.orgId, baselineRunId, run.evaluation_id])).rows[0]
      : (await db.query(`SELECT id,evaluation_id,suite_version_id,status,created_at FROM evals.run
          WHERE org_id=$1 AND evaluation_id=$2 AND id<>$3 AND status IN ('completed','partial') AND created_at < $4
          ORDER BY (suite_version_id=$5) DESC, created_at DESC, id DESC LIMIT 1`, [scope.orgId, run.evaluation_id, run.id, run.created_at, run.suite_version_id])).rows[0]) as RunRow | undefined;
    if (baselineRunId && !baseline) throw new EvalError("SCOPE_DENIED", 404);
    const candidateRows = await runOutcomeRows(db, scope.orgId, run.id);
    const candidate = { runId: run.id, evaluationId: run.evaluation_id, status: run.status, createdAt: new Date(run.created_at).toISOString(), reportId: await reportForRun(db, scope.orgId, run.id), score: scoreOf(candidateRows) };
    if (!baseline) return { candidate, baseline: null, comparable: false, reasons: ["no_baseline"], status: null, counts: null, changes: [], focus: [] };
    const baselineRows = await runOutcomeRows(db, scope.orgId, baseline.id);
    const compatibility = await runCompatibility(db, scope.orgId, baseline.id, run.id);
    const base = { runId: baseline.id, status: baseline.status, createdAt: new Date(baseline.created_at).toISOString(), reportId: await reportForRun(db, scope.orgId, baseline.id), score: scoreOf(baselineRows) };
    if (!compatibility) return { candidate, baseline: base, comparable: false, reasons: ["incomparable"], status: "incompatible" as const, counts: null, changes: [], focus: [] };
    const paired = pairedCounts(compatibility, baselineRows, candidateRows);
    if (paired.status === "incompatible") return { candidate, baseline: base, comparable: false, reasons: compatibility.reasons, status: paired.status, counts: null, changes: [], focus: [] };
    const { broken, fixed } = changedQuestions(baselineRows, candidateRows);
    const changes = [...broken.map(item => ({ ...item, direction: "regressed" as const })), ...fixed.map(item => ({ ...item, direction: "improved" as const }))].slice(0, CHANGES_LIMIT);
    return {
      candidate, baseline: base, comparable: true, reasons: compatibility.reasons, status: paired.status,
      counts: { improved: paired.improved, regressed: paired.regressed, unchanged: paired.unchanged, unassessed: paired.unassessed, added: compatibility.added.length, removed: compatibility.removed.length },
      changes: changes.map(item => ({ caseRevisionId: item.caseRevisionId, title: item.title, severity: item.severity, before: item.before, after: item.after,
        direction: item.direction, assessmentId: item.assessmentId, baselineAssessmentId: item.baselineAssessmentId })),
      focus: focusIds.flatMap(id => {
        const after = candidateRows.findLast(row => row.caseRevisionId === id), before = baselineRows.findLast(row => row.caseRevisionId === id);
        return after ? [{ caseRevisionId: id, title: after.title, severity: after.severity, before: before?.outcome ?? null, after: after.outcome, assessmentId: after.assessmentId }] : [];
      }),
    };
  });
}
export type RunComparison = Awaited<ReturnType<typeof runComparison>>;
