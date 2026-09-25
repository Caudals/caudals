import "server-only";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";
import { createReportForRun, publishReport, scoreRun, settleRunStatus } from "./managed";

// Automatic finalization of live evaluations (spec §4, §5.2 Screen D, §15.1).
// A deployed-system run that reaches a terminal state is graded with the
// deterministic scorer, waits for any rubric-judge jobs, and then gets a
// preliminary report that is published with its review status visible.
// Imported answers and private runners keep their explicit customer action.
// Reviewed reports still require an operator; nothing here claims review.

export const AUTO_GRADER_REVISION = "deterministic-v1";
export const AUTO_REPORT_SCORER = "auto-preliminary-v1";

export function finalizeRuns(scope: EvidenceScope, limit = 5, modes: string[] = ["deployed_system"]) {
  return withTenant(scope, async (db) => (await db.query(
    `SELECT r.id,r.status,r.phase,e.title,
       EXISTS (SELECT 1 FROM evals.report_revision rr WHERE rr.org_id=r.org_id AND rr.run_id=r.id) AS reported,
       EXISTS (SELECT 1 FROM evals.judge_job j WHERE j.org_id=r.org_id AND j.run_id=r.id AND j.status='queued') AS judging
     FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
     WHERE r.org_id=$1 AND r.execution_mode=ANY($3::text[])
       AND ((r.status IN ('completed','partial') AND r.phase IN ('grading','reporting')) OR (r.status='failed' AND r.phase<>'done'))
     ORDER BY r.updated_at LIMIT $2`, [scope.orgId, limit, modes])).rows).then(async (runs) => {
    const result = { scored: 0, reported: 0, failed: 0, waiting: 0 };
    for (const run of runs) {
      if (run.status === "failed") {
        // No usable deliverable under policy: tell the workspace once, keep the evidence.
        await withTenant(scope, async (db) => {
          await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
            VALUES($1,$2,'run_failed','workspace',$3,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING`,
          [scope.orgId, `run:${run.id}:failed`, { runId: run.id }]);
          await db.query("UPDATE evals.run SET phase='done',updated_at=now() WHERE org_id=$1 AND id=$2 AND status='failed'", [scope.orgId, run.id]);
        });
        result.failed++;
        continue;
      }
      if (run.phase === "grading") {
        await scoreRun(scope, run.id, AUTO_GRADER_REVISION);
        result.scored++;
        continue;
      }
      if (run.reported) {
        await withTenant(scope, (db) => db.query("UPDATE evals.run SET phase='done',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, run.id]));
        continue;
      }
      if (run.judging) { result.waiting++; continue; }
      await settleRunStatus(scope, run.id);
      const report = await createReportForRun(scope, {
        runId: run.id, title: run.title, reviewStatus: "preliminary", scorerVersion: AUTO_REPORT_SCORER,
      }, `auto-report:${run.id}`);
      await publishReport(scope, report.reportId, report.revisionId);
      await withTenant(scope, (db) => db.query("UPDATE evals.run SET phase='done',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, run.id]));
      result.reported++;
    }
    return result;
  });
}
