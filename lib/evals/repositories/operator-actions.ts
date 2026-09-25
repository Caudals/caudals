import "server-only";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

// Read models behind the report, comparison and review screens. Every query is
// tenant-scoped and bounded; none returns share token hashes, secrets, prompts
// or raw provider output.

export function listReportShares(scope: EvidenceScope, reportId: string) {
  return withTenant(scope, async (db) => {
    const report = (await db.query("SELECT id FROM evals.report WHERE org_id=$1 AND id=$2", [scope.orgId, reportId])).rows[0];
    if (!report) throw new EvalError("SCOPE_DENIED", 404);
    return (await db.query(`SELECT s.id,s.report_revision_id,s.audience,s.recipient,s.permitted_fields,s.expires_at,s.revoked_at,s.created_at,
        (SELECT count(*)::int FROM evals.share_access_event e WHERE e.org_id=s.org_id AND e.share_id=s.id) AS access_count
      FROM evals.share_grant s JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(s.org_id,s.report_revision_id)
      WHERE s.org_id=$1 AND rr.report_id=$2 ORDER BY s.created_at DESC LIMIT 50`, [scope.orgId, reportId])).rows;
  });
}

/** Runs of one evaluation, newest first, for rerun comparison. */
export function listEvaluationRuns(scope: EvidenceScope, filter: { evaluationId?: string; relatedRunId?: string }) {
  return withTenant(scope, async (db) => (await db.query(`SELECT r.id,r.status,r.phase,r.execution_mode,r.suite_version_id,r.target_revision_id,r.created_at,
      (SELECT rr.report_id FROM evals.report_revision rr WHERE rr.org_id=r.org_id AND rr.run_id=r.id ORDER BY rr.created_at DESC LIMIT 1) AS report_id
    FROM evals.run r WHERE r.org_id=$1 AND r.evaluation_id=COALESCE($2::uuid,(SELECT x.evaluation_id FROM evals.run x WHERE x.org_id=$1 AND x.id=$3::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT 50`, [scope.orgId, filter.evaluationId ?? null, filter.relatedRunId ?? null])).rows);
}

/**
 * Exception-first review queue (spec §5.5 step 5): the latest assessment of
 * each result that needs a person, critical first, with the evidence needed to
 * decide. Judge rejection reasons explain why a model grade is missing.
 */
export function listReviewQueue(scope: EvidenceScope, limit = 100) {
  return withTenant(scope, async (db) => (await db.query(`SELECT a.id AS assessment_id,a.outcome,a.review_status,a.created_at,a.document->>'rationale' AS rationale,
      a.document->'criteria' AS criteria,a.document->'extensions'->'caudals.evals/judge'->'calibration' AS judge_calibration,
      cr.document->>'title' AS case_title,cr.document->>'severity' AS severity,cr.id AS case_revision_id,
      cr.document->'reference'->'expected' AS expected,cr.document->'reference'->'source_refs' AS source_refs,
      (SELECT m.value->>'content' FROM jsonb_array_elements(o.document->'messages') WITH ORDINALITY m(value,n) WHERE m.value->>'role'='user' ORDER BY m.n LIMIT 1) AS question,
      (SELECT m.value->>'content' FROM jsonb_array_elements(o.document->'messages') WITH ORDINALITY m(value,n) WHERE m.value->>'role'='assistant' ORDER BY m.n DESC LIMIT 1) AS answer,
      o.run_id,e.title AS evaluation_title,
      (SELECT j.reason_code FROM evals.judge_job j WHERE j.org_id=a.org_id AND j.pending_assessment_id=a.id AND j.status<>'completed' LIMIT 1) AS judge_reason
    FROM evals.assessment a
    JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id)
    JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
    JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
    JOIN evals.run r ON (r.org_id,r.id)=(o.org_id,o.run_id)
    JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
    WHERE a.org_id=$1 AND a.review_status IN ('needs_review','disputed')
      AND a.id=(SELECT x.id FROM evals.assessment x WHERE x.org_id=a.org_id AND x.observation_id=a.observation_id ORDER BY x.created_at DESC,x.id DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM evals.review_decision d WHERE d.org_id=a.org_id AND d.assessment_id=a.id AND d.decision='approve')
      AND NOT EXISTS (SELECT 1 FROM evals.judge_job q WHERE q.org_id=a.org_id AND q.pending_assessment_id=a.id AND q.status='queued')
    ORDER BY (cr.document->>'severity'='critical') DESC, a.created_at LIMIT $2`, [scope.orgId, limit])).rows);
}

/** Reference material with provenance and extraction state (Library › Sources). */
export function listSources(scope: EvidenceScope) {
  return withTenant(scope, async (db) => (await db.query(`SELECT s.id,s.title,s.rights,s.created_at,p.title AS project_title,
      (SELECT count(*)::int FROM evals.source_revision r WHERE r.org_id=s.org_id AND r.source_id=s.id) AS revisions,
      (SELECT r.extraction_version FROM evals.source_revision r WHERE r.org_id=s.org_id AND r.source_id=s.id ORDER BY r.created_at DESC LIMIT 1) AS extraction_version,
      (SELECT jsonb_array_length(r.document->'anchors') FROM evals.source_revision r WHERE r.org_id=s.org_id AND r.source_id=s.id ORDER BY r.created_at DESC LIMIT 1) AS anchors,
      (SELECT j.status FROM evals.source_ingestion_job j WHERE j.org_id=s.org_id AND j.source_id=s.id ORDER BY j.created_at DESC LIMIT 1) AS ingestion_status
    FROM evals."source" s JOIN evals.project p ON (p.org_id,p.id)=(s.org_id,s.project_id)
    WHERE s.org_id=$1 ORDER BY s.created_at DESC LIMIT 200`, [scope.orgId])).rows);
}
