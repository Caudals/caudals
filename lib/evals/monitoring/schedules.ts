import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { units } from "../budget/money";
import { EvalError } from "../domain/errors";
import { idempotent, type EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";
import { createSelfServiceRun } from "../repositories/stage-c";
import { latestDueSlot, nextScheduleSlot, scheduleConfigSchema, type ScheduleConfig } from "./calendar";

const money=z.string().regex(/^(0|[1-9]\d{0,14})(?:\.\d{1,9})?$/);
export const createScheduleSchema=scheduleConfigSchema.extend({
  evaluationId:z.uuid(),targetRevisionId:z.uuid(),suiteVersionId:z.uuid(),
  maxRunSpend:money,currency:z.string().regex(/^[A-Z]{3}$/),
  sourceMaxAgeDays:z.int().min(1).max(3650).nullable(),
});
export const updateScheduleSchema=z.strictObject({expectedVersion:z.int().positive(),
  status:z.enum(["active","paused"]).optional(),targetRevisionId:z.uuid().optional(),
  suiteVersionId:z.uuid().optional(),maxRunSpend:money.optional(),sourceMaxAgeDays:z.int().min(1).max(3650).nullable().optional()});
function config(row:Record<string,unknown>):ScheduleConfig{return scheduleConfigSchema.parse({timezone:row.timezone,cadence:row.cadence,
  localTime:String(row.local_time),weekday:row.weekday===null?null:Number(row.weekday),
  dayOfMonth:row.day_of_month===null?null:Number(row.day_of_month)});}
function notFound():never{throw new EvalError("SCOPE_DENIED",404);}

export function createSchedule(scope:EvidenceScope,raw:unknown,key:string){
  const input=createScheduleSchema.parse(raw),first=nextScheduleSlot({timezone:input.timezone,
    cadence:input.cadence,localTime:input.localTime,weekday:input.weekday,
    dayOfMonth:input.dayOfMonth},new Date());
  return withTenant(scope,db=>idempotent(db,scope,"monitor-schedules",key,input,async()=>{
    const entitlement=(await db.query("SELECT can_schedule,monthly_spend_limit,currency FROM evals.workspace_entitlement WHERE org_id=$1",[scope.orgId])).rows[0];
    if(!entitlement?.can_schedule)throw new EvalError("SCOPE_DENIED",403,"Scheduled monitoring is not enabled for this workspace.");
    const evaluation=(await db.query("SELECT project_id,preparation_status,selected_suite_version_id,commercial_cap,currency FROM evals.evaluation WHERE org_id=$1 AND id=$2",[scope.orgId,input.evaluationId])).rows[0];
    if(!evaluation || evaluation.preparation_status!=="ready" || evaluation.selected_suite_version_id!==input.suiteVersionId)notFound();
    if(evaluation.currency!==input.currency || entitlement.currency!==input.currency ||
      units(String(evaluation.commercial_cap))>units(input.maxRunSpend) ||
      units(input.maxRunSpend)>units(String(entitlement.monthly_spend_limit)))
      throw new EvalError("BUDGET_PAUSED",409,"The schedule must fit the agreed run and monthly spending limits.");
    const row=(await db.query(`INSERT INTO evals.monitor_schedule
      (org_id,project_id,evaluation_id,target_revision_id,suite_version_id,timezone,cadence,local_time,
       weekday,day_of_month,max_run_spend,currency,source_max_age_days,next_due_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id,status,version,next_due_at,created_at`,
      [scope.orgId,evaluation.project_id,input.evaluationId,input.targetRevisionId,input.suiteVersionId,
        input.timezone,input.cadence,input.localTime,input.weekday,input.dayOfMonth,input.maxRunSpend,
        input.currency,input.sourceMaxAgeDays,first.scheduledFor])).rows[0];
    return {...row,localSlotKey:first.localSlotKey};
  }));
}
export function listSchedules(scope:EvidenceScope){return withTenant(scope,async db=>(await db.query(`SELECT s.id,s.project_id,s.evaluation_id,s.target_revision_id,s.suite_version_id,
  s.timezone,s.cadence,s.local_time,s.weekday,s.day_of_month,s.max_run_spend,s.currency,
  s.source_max_age_days,s.status,s.reason_code,s.next_due_at,s.version,s.updated_at,
  d.status AS latest_dispatch_status,d.reason_code AS latest_dispatch_reason,d.scheduled_for AS latest_scheduled_for,
  a.status AS latest_alert_status
  FROM evals.monitor_schedule s
  LEFT JOIN LATERAL (SELECT * FROM evals.schedule_dispatch x WHERE x.org_id=s.org_id AND x.schedule_id=s.id
    ORDER BY x.scheduled_for DESC,x.id DESC LIMIT 1) d ON true
  LEFT JOIN evals.regression_alert a ON (a.org_id,a.schedule_dispatch_id)=(d.org_id,d.id)
  WHERE s.org_id=$1 ORDER BY s.updated_at DESC,s.id LIMIT 100`,[scope.orgId])).rows);}
export function updateSchedule(scope:EvidenceScope,id:string,raw:unknown){
  const input=updateScheduleSchema.parse(raw);
  return withTenant(scope,async db=>{
    const previous=(await db.query("SELECT * FROM evals.monitor_schedule WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,id])).rows[0];
    if(!previous)notFound();
    if(previous.version!==input.expectedVersion)throw new EvalError("VERSION_CONFLICT",409,"The schedule changed. Reload it before saving.");
    if(input.status==="paused"&&input.targetRevisionId===undefined&&input.suiteVersionId===undefined&&
      input.maxRunSpend===undefined&&input.sourceMaxAgeDays===undefined){
      return (await db.query(`UPDATE evals.monitor_schedule SET status='paused',reason_code='manual_pause',version=version+1,updated_at=now()
        WHERE org_id=$1 AND id=$2 RETURNING id,status,reason_code,version,next_due_at,updated_at`,[scope.orgId,id])).rows[0];
    }
    const targetRevisionId=input.targetRevisionId??previous.target_revision_id,
      suiteVersionId=input.suiteVersionId??previous.suite_version_id,
      maxRunSpend=input.maxRunSpend??String(previous.max_run_spend),
      sourceMaxAgeDays=input.sourceMaxAgeDays===undefined?previous.source_max_age_days:input.sourceMaxAgeDays;
    const limits=(await db.query("SELECT can_schedule,monthly_spend_limit,currency FROM evals.workspace_entitlement WHERE org_id=$1",[scope.orgId])).rows[0];
    const evaluation=(await db.query("SELECT preparation_status,selected_suite_version_id,commercial_cap,currency FROM evals.evaluation WHERE org_id=$1 AND id=$2",[scope.orgId,previous.evaluation_id])).rows[0];
    if(!limits?.can_schedule || !evaluation || evaluation.preparation_status!=="ready" ||
      evaluation.selected_suite_version_id!==suiteVersionId)throw new EvalError("SCOPE_DENIED",409,"Approve the test set before updating this schedule.");
    if(limits.currency!==previous.currency || evaluation.currency!==previous.currency ||
      units(String(evaluation.commercial_cap))>units(maxRunSpend) || units(maxRunSpend)>units(String(limits.monthly_spend_limit)))
      throw new EvalError("BUDGET_PAUSED",409,"The updated schedule exceeds the agreed spending limits.");
    return (await db.query(`UPDATE evals.monitor_schedule SET target_revision_id=$3,suite_version_id=$4,
      max_run_spend=$5,source_max_age_days=$6,status=$7,reason_code=CASE WHEN $7='paused' THEN 'manual_pause' ELSE NULL END,
      version=version+1,updated_at=now()
      WHERE org_id=$1 AND id=$2 RETURNING id,status,reason_code,version,next_due_at,updated_at`,
      [scope.orgId,id,targetRevisionId,suiteVersionId,maxRunSpend,sourceMaxAgeDays,input.status??previous.status])).rows[0];
  });
}

export async function claimDueSchedules(scope:EvidenceScope,now=new Date().toISOString()){
  return withTenant(scope,async db=>{
    const rows=(await db.query(`SELECT * FROM evals.monitor_schedule WHERE org_id=$1 AND status='active'
      AND next_due_at<=$2 ORDER BY next_due_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`,[scope.orgId,now])).rows;
    const claimed:string[]=[];
    for(const row of rows){
      const due=latestDueSlot(config(row),new Date(row.next_due_at).toISOString(),now);
      await db.query("UPDATE evals.monitor_schedule SET next_due_at=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,row.id,due.next.scheduledFor]);
      if(!due.latest)continue;
      const created=(await db.query(`INSERT INTO evals.schedule_dispatch
        (org_id,schedule_id,scheduled_for,local_slot_key,schedule_version,target_revision_id,suite_version_id,
         max_run_spend,missed_slots,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'claimed')
        ON CONFLICT(org_id,schedule_id,local_slot_key) DO NOTHING RETURNING id`,
        [scope.orgId,row.id,due.latest.scheduledFor,due.latest.localSlotKey,row.version,
          row.target_revision_id,row.suite_version_id,row.max_run_spend,due.missedCount])).rows[0];
      if(created)claimed.push(created.id);
    }
    return claimed;
  });
}
async function eligibility(db:PoolClient,scope:EvidenceScope,dispatch:Record<string,unknown>){
  const schedule=(await db.query("SELECT * FROM evals.monitor_schedule WHERE org_id=$1 AND id=$2",[scope.orgId,dispatch.schedule_id])).rows[0];
  if(!schedule || schedule.status!=="active" || schedule.version!==dispatch.schedule_version)return "schedule_changed";
  const entitlement=(await db.query("SELECT can_schedule,monthly_spend_limit,currency,max_active_runs FROM evals.workspace_entitlement WHERE org_id=$1",[scope.orgId])).rows[0];
  if(!entitlement?.can_schedule)return "schedule_not_funded";
  const evaluation=(await db.query("SELECT preparation_status,selected_suite_version_id,commercial_cap,currency FROM evals.evaluation WHERE org_id=$1 AND id=$2",[scope.orgId,schedule.evaluation_id])).rows[0];
  if(!evaluation || evaluation.preparation_status!=="ready" || evaluation.selected_suite_version_id!==dispatch.suite_version_id)return "suite_changed";
  if(evaluation.currency!==entitlement.currency || units(String(evaluation.commercial_cap))>units(String(dispatch.max_run_spend)))return "schedule_budget_invalid";
  const active=(await db.query(`SELECT 1 FROM evals.schedule_dispatch d LEFT JOIN evals.run r
    ON (r.org_id,r.id)=(d.org_id,d.run_id) WHERE d.org_id=$1 AND d.schedule_id=$2
    AND d.id<>$3 AND (d.status='starting' OR r.status IN ('queued','running','pause_requested','paused','cancel_requested')) LIMIT 1`,
    [scope.orgId,schedule.id,dispatch.id])).rows[0];
  if(active)return "overlap_skipped";
  const spent=(await db.query(`SELECT
    (SELECT COALESCE(sum(amount),0) FROM evals.execution_cost_entry WHERE org_id=$1 AND created_at>=date_trunc('month',now()))::text AS settled,
    (SELECT COALESCE(sum(amount),0) FROM evals.budget_reservation WHERE org_id=$1 AND state IN ('reserved','unresolved')
      AND created_at>=date_trunc('month',now()))::text AS outstanding`,[scope.orgId])).rows[0];
  if(units(spent.settled)+units(spent.outstanding)+units(String(dispatch.max_run_spend))>units(String(entitlement.monthly_spend_limit)))return "monthly_budget_exhausted";
  if(schedule.source_max_age_days!==null){
    const sourceState=(await db.query(`SELECT jsonb_array_length(sv.manifest->'source_revisions') AS expected,
      count(sr.id)::int AS present,
      bool_and(sr.created_at>=now()-$3::int*interval '1 day') AS fresh
      FROM evals.suite_version sv
      LEFT JOIN LATERAL jsonb_array_elements(sv.manifest->'source_revisions') ref ON true
      LEFT JOIN evals.source_revision sr ON sr.org_id=sv.org_id AND sr.id=(ref->>'revision_id')::uuid
        AND sr.content_hash=ref->>'content_hash'
      WHERE sv.org_id=$1 AND sv.id=$2 GROUP BY sv.id`,
      [scope.orgId,dispatch.suite_version_id,schedule.source_max_age_days])).rows[0];
    if(!sourceState||sourceState.expected===0||sourceState.present!==sourceState.expected||!sourceState.fresh)return "sources_stale";
  }
  return null;
}
export async function dispatchScheduleSlot(scope:EvidenceScope,id:string){
  const prepared=await withTenant(scope,async db=>{
    const dispatch=(await db.query("SELECT * FROM evals.schedule_dispatch WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,id])).rows[0];
    if(!dispatch)notFound();
    if(["started","skipped","failed"].includes(dispatch.status))return {done:true,dispatch};
    if(dispatch.status==="starting" && Date.now()-new Date(dispatch.updated_at).getTime()<60_000)return {done:true,dispatch};
    if(dispatch.attempt_count>=5){
      await db.query("UPDATE evals.schedule_dispatch SET status='failed',reason_code='retry_limit',updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,id]);
      return {done:true,dispatch:{...dispatch,status:"failed",reason_code:"retry_limit"}};
    }
    const reason=await eligibility(db,scope,dispatch);
    if(reason){
      await db.query("UPDATE evals.schedule_dispatch SET status='skipped',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,id,reason]);
      return {done:true,dispatch:{...dispatch,status:"skipped",reason_code:reason}};
    }
    await db.query("UPDATE evals.schedule_dispatch SET status='starting',attempt_count=attempt_count+1,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,id]);
    const schedule=(await db.query("SELECT evaluation_id FROM evals.monitor_schedule WHERE org_id=$1 AND id=$2",[scope.orgId,dispatch.schedule_id])).rows[0];
    return {done:false,dispatch,evaluationId:schedule.evaluation_id as string};
  });
  if(prepared.done)return prepared.dispatch;
  try{
    const run=await createSelfServiceRun({orgId:scope.orgId,actorId:"evals-scheduler"},{evaluationId:prepared.evaluationId!,
      targetRevisionId:prepared.dispatch.target_revision_id,suiteVersionId:prepared.dispatch.suite_version_id},
      `schedule-${id}`);
    return withTenant(scope,async db=>(await db.query(`UPDATE evals.schedule_dispatch SET status='started',run_id=$3,
      reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *`,[scope.orgId,id,run.id])).rows[0]);
  }catch(error){
    const reason=error instanceof EvalError?error.code:"dispatch_failed";
    return withTenant(scope,async db=>(await db.query(`UPDATE evals.schedule_dispatch SET status=$3,
      reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING *`,
      [scope.orgId,id,error instanceof EvalError?"skipped":"claimed",reason])).rows[0]);
  }
}
export async function tickSchedules(scope:EvidenceScope,now=new Date().toISOString()){
  const fresh=await claimDueSchedules(scope,now);
  const stale=await withTenant(scope,async db=>(await db.query(`SELECT id FROM evals.schedule_dispatch
    WHERE org_id=$1 AND status IN ('claimed','starting') AND updated_at<now()-interval '1 minute'
    ORDER BY updated_at,id LIMIT 20`,[scope.orgId])).rows.map(row=>row.id as string));
  const ids=[...new Set([...fresh,...stale])];
  const results=[];for(const id of ids)results.push(await dispatchScheduleSlot(scope,id));
  return results;
}
