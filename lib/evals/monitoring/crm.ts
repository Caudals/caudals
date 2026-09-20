import "server-only";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";

export function handoffSummary(input:{reportId:string;reportRevisionId:string;title:string;metrics:Record<string,unknown>;
  findings:Array<{title:string;severity:string}>}){
  return {status:"draft_for_operator_review",report_id:input.reportId,report_revision_id:input.reportRevisionId,
    title:input.title.slice(0,160),planned_count:Number(input.metrics.n_planned??0),
    assessed_count:Number(input.metrics.n_scorable??0),
    findings:input.findings.slice(0,3).map(item=>({title:item.title.slice(0,160),severity:item.severity}))};
}
export function createCrmHandoffDraft(tenant:EvidenceScope,reportRevisionId:string){
  z.uuid().parse(reportRevisionId);
  return withTenant(tenant,async db=>{
    const row=(await db.query(`SELECT rr.id,r.id AS report_id,r.title,rr.snapshot FROM evals.report_revision rr
      JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id)
      WHERE rr.org_id=$1 AND rr.id=$2 AND rr.review_status='reviewed'
      AND r.current_revision_id=rr.id AND r.publication_status='published'`,[tenant.orgId,reportRevisionId])).rows[0];
    if(!row)throw new EvalError("SCOPE_DENIED",404,"Use a reviewed, published report revision.");
    const snapshot=row.snapshot as {metrics?:Record<string,unknown>;findings?:Array<{title:string;severity:string}>};
    const summary=handoffSummary({reportId:row.report_id,reportRevisionId,title:row.title,
      metrics:snapshot.metrics??{},findings:snapshot.findings??[]});
    const draft=(await db.query(`INSERT INTO evals.crm_handoff_draft(org_id,report_revision_id,summary)
      VALUES($1,$2,$3) ON CONFLICT(org_id,report_revision_id) DO NOTHING RETURNING id,summary,created_at`,
      [tenant.orgId,reportRevisionId,summary])).rows[0];
    return draft??(await db.query("SELECT id,summary,created_at FROM evals.crm_handoff_draft WHERE org_id=$1 AND report_revision_id=$2",
      [tenant.orgId,reportRevisionId])).rows[0];
  });
}
export function listCrmHandoffDrafts(tenant:EvidenceScope){return withTenant(tenant,async db=>(await db.query(`SELECT id,report_revision_id,summary,created_by,created_at
  FROM evals.crm_handoff_draft WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[tenant.orgId])).rows);}
