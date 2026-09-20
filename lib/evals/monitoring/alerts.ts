import "server-only";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { compareRuns, scoreRun } from "../repositories/managed";
import { withTenant } from "../repositories/db";
import type { EvidenceScope } from "../repositories/evidence";
import { queueWebhookEvent } from "./webhooks";

type RunEvidence={status:string;coverage:number;criticalUnassessed:number};
type PairedEvidence={status:string;regressed:number;improved:number;common:string[];unassessed:number;compatible:boolean;reasons:string[]};
export function classifyMonitoringOutcome(input:{baseline:RunEvidence|null;candidate:RunEvidence;comparison:PairedEvidence|null}){
  if(["failed","canceled"].includes(input.candidate.status))return {status:"unknown" as const,reasons:["run_failed"]};
  if(input.candidate.status!=="completed")return {status:"inconclusive" as const,reasons:["run_incomplete"]};
  if(!input.baseline)return {status:"inconclusive" as const,reasons:["no_baseline"]};
  if(input.baseline.status!=="completed"||input.baseline.coverage<0.9||input.candidate.coverage<0.9||
    input.baseline.criticalUnassessed>0||input.candidate.criticalUnassessed>0)
    return {status:"inconclusive" as const,reasons:["coverage_inadequate"]};
  const comparison=input.comparison;
  if(!comparison||!comparison.compatible||comparison.status==="incompatible")
    return {status:"inconclusive" as const,reasons:comparison?.reasons.length?comparison.reasons:["incomparable"]};
  if(!comparison.common.length||comparison.unassessed>0)return {status:"inconclusive" as const,reasons:["paired_coverage_inadequate"]};
  return comparison.regressed>0?{status:"regression" as const,reasons:["paired_case_regressed"]}:
    {status:"pass" as const,reasons:[]};
}
async function runEvidence(db:PoolClient,orgId:string,runId:string){
  const row=(await db.query(`SELECT r.status,count(cu.id)::int AS planned,
    count(a.id)::int AS assessed,
    count(a.id) FILTER(WHERE cr.document->>'severity'='critical')::int AS critical_assessed,
    count(cu.id) FILTER(WHERE cr.document->>'severity'='critical')::int AS critical_planned
    FROM evals.run r JOIN evals.case_unit cu ON (cu.org_id,cu.run_id)=(r.org_id,r.id)
    JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
    LEFT JOIN LATERAL (SELECT id FROM evals.assessment x WHERE x.org_id=cu.org_id AND x.observation_id IN
      (SELECT o.id FROM evals.observation o WHERE (o.org_id,o.case_unit_id)=(cu.org_id,cu.id))
      ORDER BY x.created_at DESC,x.id DESC LIMIT 1) a ON true
    WHERE r.org_id=$1 AND r.id=$2 GROUP BY r.status`,[orgId,runId])).rows[0];
  if(!row)throw new EvalError("SCOPE_DENIED",404);
  return {status:row.status as string,coverage:row.planned?row.assessed/row.planned:0,
    criticalUnassessed:row.critical_planned-row.critical_assessed};
}
export async function settleScheduledRun(tenant:EvidenceScope,dispatchId:string){
  const state=await withTenant(tenant,async db=>{
    const d=(await db.query(`SELECT d.*,s.evaluation_id FROM evals.schedule_dispatch d
      JOIN evals.monitor_schedule s ON (s.org_id,s.id)=(d.org_id,d.schedule_id)
      WHERE d.org_id=$1 AND d.id=$2`,[tenant.orgId,dispatchId])).rows[0];
    if(!d?.run_id||d.status!=="started")return null;
    const old=(await db.query("SELECT id FROM evals.regression_alert WHERE org_id=$1 AND schedule_dispatch_id=$2",[tenant.orgId,dispatchId])).rows[0];
    if(old)return null;
    const run=(await db.query("SELECT status FROM evals.run WHERE org_id=$1 AND id=$2",[tenant.orgId,d.run_id])).rows[0];
    if(!run||!["completed","partial","failed","canceled"].includes(run.status))return null;
    const baseline=(await db.query(`SELECT d.run_id FROM evals.schedule_dispatch d JOIN evals.run r
      ON (r.org_id,r.id)=(d.org_id,d.run_id) WHERE d.org_id=$1 AND d.schedule_id=$2 AND d.scheduled_for<$3
      AND r.status='completed' ORDER BY d.scheduled_for DESC LIMIT 1`,[tenant.orgId,d.schedule_id,d.scheduled_for])).rows[0];
    return {candidateId:d.run_id as string,baselineId:baseline?.run_id as string|undefined,runStatus:run.status as string};
  });
  if(!state)return null;
  // Deterministic grading is idempotent for the same observations and grader revision.
  if(state.runStatus==="completed"||state.runStatus==="partial")await scoreRun(tenant,state.candidateId,"deterministic-v1");
  if(state.baselineId)await scoreRun(tenant,state.baselineId,"deterministic-v1");
  const comparison=state.baselineId&&state.runStatus==="completed"?
    await compareRuns(tenant,state.baselineId,state.candidateId):null;
  return withTenant(tenant,async db=>{
    const existing=(await db.query("SELECT * FROM evals.regression_alert WHERE org_id=$1 AND schedule_dispatch_id=$2",[tenant.orgId,dispatchId])).rows[0];
    if(existing)return existing;
    const candidate=await runEvidence(db,tenant.orgId,state.candidateId),baseline=state.baselineId?
      await runEvidence(db,tenant.orgId,state.baselineId):null;
    const verdict=classifyMonitoringOutcome({baseline,candidate,comparison:comparison?{
      status:comparison.status,regressed:"regressed" in comparison?comparison.regressed:0,
      improved:"improved" in comparison?comparison.improved:0,
      common:comparison.common,unassessed:"unassessed" in comparison?comparison.unassessed:0,compatible:comparison.compatible,
      reasons:comparison.reasons}:null});
    const row=(await db.query(`INSERT INTO evals.regression_alert(org_id,schedule_dispatch_id,baseline_run_id,
      candidate_run_id,comparison_id,status,reason_codes,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(org_id,schedule_dispatch_id) DO NOTHING RETURNING *`,[tenant.orgId,dispatchId,
      state.baselineId??null,state.candidateId,comparison?.id??null,verdict.status,verdict.reasons,
      {baseline,candidate,comparison:comparison??null}])).rows[0];
    if(!row)return (await db.query("SELECT * FROM evals.regression_alert WHERE org_id=$1 AND schedule_dispatch_id=$2",[tenant.orgId,dispatchId])).rows[0];
    const eventId=`monitor:${dispatchId}:${verdict.status}`;
    await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
      VALUES($1,$2,$3,'workspace',$4,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING`,
      [tenant.orgId,eventId,`monitor_${verdict.status}`,{alert_id:row.id,run_id:state.candidateId,
        schedule_dispatch_id:dispatchId,status:verdict.status,reason_codes:verdict.reasons}]);
    await queueWebhookEvent(db,tenant.orgId,eventId,verdict.status==="regression"?"regression":verdict.status==="inconclusive"&&candidate.status==="partial"?"run_partial":verdict.status==="inconclusive"?"inconclusive":
      verdict.status==="unknown"?"run_unknown":"run_completed",{alert_id:row.id,dispatch_id:dispatchId,run_id:state.candidateId,
      baseline_run_id:state.baselineId??null,status:verdict.status,reason_codes:verdict.reasons});
    return row;
  });
}
export async function tickScheduledAlerts(tenant:EvidenceScope){
  const ids=await withTenant(tenant,async db=>(await db.query(`SELECT d.id FROM evals.schedule_dispatch d
    JOIN evals.run r ON (r.org_id,r.id)=(d.org_id,d.run_id)
    LEFT JOIN evals.regression_alert a ON (a.org_id,a.schedule_dispatch_id)=(d.org_id,d.id)
    WHERE d.org_id=$1 AND d.status='started' AND a.id IS NULL
      AND r.status IN ('completed','partial','failed','canceled') ORDER BY d.scheduled_for,d.id LIMIT 20`,[tenant.orgId])).rows.map(row=>row.id as string));
  for(const id of ids)await settleScheduledRun(tenant,id);
  return ids.length;
}
