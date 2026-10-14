import "server-only";
import type { PoolClient } from "pg";
import { withTenant } from "../repositories/db";
import { deletePrivateObject } from "../storage/private";
import { canonicalJson,sha256 } from "../contracts/hashing";
import { dataControlsEnabled } from "../data-controls/flags";

export type LifecycleScope={orgId:string;actorId:string};
export function scheduleRetention(scope:LifecycleScope,input:{objectType:"artifact"|"share"|"report";objectId:string;action:"expire"|"redact"|"delete";notBefore:string}){return withTenant(scope,async db=>(await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before) VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,object_type,object_id,action) DO UPDATE SET not_before=LEAST(evals.retention_job.not_before,excluded.not_before) RETURNING id,status,not_before`,[scope.orgId,input.objectType,input.objectId,input.action,input.notBefore])).rows[0]);}
/**
 * Runs due retention jobs. Artifacts: object deleted, then metadata. Shares
 * revoked, reports withdrawn. Launch L-32 adds observation runs (the answers
 * older than the workspace's retention setting are purged, pins respected,
 * each purge recorded per observation by evals.purge_retained_observations)
 * and workspace exports (the stored ZIP deleted at expiry or on request).
 */
export async function processRetention(scope:LifecycleScope,limit=50,options:{dataControls?:boolean}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("retention_limit_invalid");
 const dataControls=options.dataControls??dataControlsEnabled();
 const jobs=await withTenant(scope,async db=>(await db.query("SELECT * FROM evals.retention_job WHERE org_id=$1 AND status='pending' AND not_before<=now() ORDER BY not_before,id LIMIT $2 FOR UPDATE SKIP LOCKED",[scope.orgId,limit])).rows);
 let completed=0;
 for(const job of jobs){
  try{
   if(job.object_type==="observation_run"){
    // With the flag off a queued purge waits; the hourly pass re-arms it once the flag is back on.
    if(!dataControls){await withTenant(scope,db=>db.query("UPDATE evals.retention_job SET status='failed',reason_code='data_controls_off',completed_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id]));continue;}
    for(let pass=0;pass<20;pass++){const purged=await withTenant(scope,async db=>Number((await db.query("SELECT evals.purge_retained_observations($1,$2,1000) AS purged",[scope.orgId,job.object_id])).rows[0].purged));if(purged<1000)break;}
    await withTenant(scope,db=>db.query("UPDATE evals.retention_job SET status='completed',reason_code=NULL,completed_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id]));
    completed++;continue;
   }
   let action:"artifact_deleted"|"share_revoked"|"report_withdrawn"|"export_deleted";
   if(job.object_type==="artifact"){action="artifact_deleted";const artifact=await withTenant(scope,async db=>(await db.query("SELECT id,object_key,state FROM evals.artifact WHERE org_id=$1 AND id=$2 AND state<>'deleted'",[scope.orgId,job.object_id])).rows[0]);if(artifact){await deletePrivateObject(artifact.object_key);await withTenant(scope,db=>db.query("UPDATE evals.artifact SET state='deleted',expires_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,artifact.id]));}}
   else if(job.object_type==="workspace_export"){action="export_deleted";const file=await withTenant(scope,async db=>(await db.query("SELECT id,object_key FROM evals.workspace_export WHERE org_id=$1 AND id=$2 AND object_key IS NOT NULL AND object_deleted_at IS NULL",[scope.orgId,job.object_id])).rows[0]);if(file){await deletePrivateObject(file.object_key);await withTenant(scope,db=>db.query("UPDATE evals.workspace_export SET object_deleted_at=now(),status=CASE WHEN status='completed' THEN 'expired' ELSE status END,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,file.id]));}}
   else if(job.object_type==="share"){action="share_revoked";await withTenant(scope,db=>db.query("UPDATE evals.share_grant SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND id=$2",[scope.orgId,job.object_id]));}
   else{action="report_withdrawn";await withTenant(scope,db=>db.query("UPDATE evals.report SET publication_status='withdrawn',updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.object_id]));}
   await withTenant(scope,async db=>{await db.query("INSERT INTO evals.recovery_control_event(org_id,action,subject_type,subject_id,actor_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",[scope.orgId,action,job.object_type,job.object_id,scope.actorId,sha256(canonicalJson({action,id:job.object_id}))]);await db.query("UPDATE evals.retention_job SET status='completed',completed_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id]);});
   completed++;
  }catch{await withTenant(scope,db=>db.query("UPDATE evals.retention_job SET status='failed',reason_code='retention_action_failed',completed_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id]));}
 }
 return {selected:jobs.length,completed,failed:jobs.length-completed};
}

export async function replayRecoveryControls(client:PoolClient,snapshotAt:string,throughId?:number){const rows=(await client.query(`SELECT * FROM evals.recovery_control_event WHERE occurred_at>$1 AND ($2::bigint IS NULL OR id<=$2) ORDER BY id`,[snapshotAt,throughId??null])).rows;for(const event of rows){if(event.action==="share_revoked")await client.query("UPDATE evals.share_grant SET revoked_at=COALESCE(revoked_at,$2) WHERE org_id=$1 AND id=$3",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="credential_revoked")await client.query("UPDATE evals.secret_record SET revoked_at=COALESCE(revoked_at,$2) WHERE org_id=$1 AND id=$3",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="artifact_deleted")await client.query("UPDATE evals.artifact SET state='deleted',expires_at=LEAST(expires_at,$2) WHERE org_id=$1 AND id=$3",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="report_withdrawn")await client.query("UPDATE evals.report SET publication_status='withdrawn',updated_at=GREATEST(updated_at,$2) WHERE org_id=$1 AND id=$3",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="observation_purged")await client.query("UPDATE evals.observation SET purged_at=$2,document=evals.purged_observation_document(document,$2) WHERE org_id=$1 AND id=$3 AND purged_at IS NULL",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="export_deleted")await client.query("UPDATE evals.workspace_export SET object_deleted_at=COALESCE(object_deleted_at,$2),status=CASE WHEN status='completed' THEN 'expired' ELSE status END WHERE org_id=$1 AND id=$3",[event.org_id,event.occurred_at,event.subject_id]);else if(event.action==="workspace_deleted"){await client.query("UPDATE evals.share_grant SET revoked_at=COALESCE(revoked_at,$2) WHERE org_id=$1",[event.org_id,event.occurred_at]);await client.query("UPDATE evals.secret_record SET revoked_at=COALESCE(revoked_at,$2) WHERE org_id=$1",[event.org_id,event.occurred_at]);await client.query("UPDATE evals.report SET publication_status='withdrawn',updated_at=GREATEST(updated_at,$2) WHERE org_id=$1",[event.org_id,event.occurred_at]);}}return {replayed:rows.length,through:rows.at(-1)?.id??null};}

// ---------------------------------------------------------------------------
// Scheduled retention and workspace deletion (spec §16.4, §17.5).

/** Workspaces with due retention or deletion work; IDs only. */
export async function lifecycleDueWorkspaces(actorId:string):Promise<string[]>{
 return withTenant({orgId:"",actorId},async db=>(await db.query("SELECT evals.lifecycle_due_workspaces() AS id")).rows.map(row=>row.id as string));
}

/** Queue deletion of every live artifact whose retention period has ended, and of expired workspace exports (launch L-32). */
export function scheduleDueRetention(scope:LifecycleScope,limit=200){
 return withTenant(scope,async db=>{
  const artifacts=(await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before)
   SELECT org_id,'artifact',id,'delete',expires_at FROM evals.artifact WHERE org_id=$1 AND state<>'deleted' AND expires_at<=now()
   ORDER BY expires_at LIMIT $2 ON CONFLICT(org_id,object_type,object_id,action) DO NOTHING`,[scope.orgId,limit])).rowCount??0;
  const exports=(await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before)
   SELECT org_id,'workspace_export',id,'delete',expires_at FROM evals.workspace_export
   WHERE org_id=$1 AND object_key IS NOT NULL AND object_deleted_at IS NULL AND expires_at<=now()
   ORDER BY expires_at LIMIT $2 ON CONFLICT(org_id,object_type,object_id,action) DO NOTHING`,[scope.orgId,limit])).rowCount??0;
  return artifacts+exports;
 });
}

/**
 * Answer retention (launch L-32): one `observation_run` job per run that has
 * unpinned answers older than the workspace's setting. A run whose job already
 * ran is re-armed when more of its answers fall due (or an hour after a
 * failure); the purge itself re-checks the setting and the pins.
 */
export async function queueObservationRetention(db:PoolClient,orgId:string,limit=200){
 return (await db.query(`INSERT INTO evals.retention_job AS j (org_id,object_type,object_id,action,not_before)
  SELECT o.org_id,'observation_run',o.run_id,'redact',now()
  FROM evals.observation o JOIN evals.workspace_retention s ON s.org_id=o.org_id AND s.observation_days IS NOT NULL
  WHERE o.org_id=$1 AND o.purged_at IS NULL AND o.created_at < now()-make_interval(days=>s.observation_days)
   AND NOT evals.observation_retention_pinned(o.org_id,o.run_id,o.id)
  GROUP BY o.org_id,o.run_id ORDER BY min(o.created_at) LIMIT $2
  ON CONFLICT(org_id,object_type,object_id,action) DO UPDATE SET status='pending',reason_code=NULL,completed_at=NULL,not_before=now()
   WHERE j.status='completed' OR (j.status='failed' AND j.completed_at<now()-interval '1 hour')`,[orgId,limit])).rowCount??0;
}
export function scheduleObservationRetention(scope:LifecycleScope,limit=200){
 return withTenant(scope,db=>queueObservationRetention(db,scope.orgId,limit));
}

/** Workspaces whose retention setting makes answers due, scheduled as retention jobs; the lifecycle pass runs them. */
export async function tickObservationRetention(actorId:string){
 const orgs=await withTenant({orgId:"",actorId},async db=>(await db.query("SELECT evals.observation_retention_due_workspaces() AS id")).rows.map(row=>row.id as string));
 let scheduled=0;
 for(const orgId of orgs)scheduled+=await scheduleObservationRetention({orgId,actorId});
 return {workspaces:orgs.length,scheduled};
}

export async function requestWorkspaceDeletion(scope:LifecycleScope,reason:string){
 return withTenant(scope,async db=>{
  const open=(await db.query("SELECT id,status FROM evals.deletion_request WHERE org_id=$1 AND status IN ('requested','processing')",[scope.orgId])).rows[0];
  if(open)return open;
  const request=(await db.query("INSERT INTO evals.deletion_request(org_id,scope,reason,requested_by,not_before) VALUES($1,'workspace',$2,$3,now()) RETURNING id,status,requested_at",[scope.orgId,reason,scope.actorId])).rows[0];
  // Access stops now; object deletion follows in the lifecycle worker.
  await db.query("UPDATE evals.share_grant SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1",[scope.orgId]);
  await db.query("UPDATE evals.secret_record SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1",[scope.orgId]);
  // The workspace's own model keys (BYOK, launch L-27) are erased with its other credentials.
  await db.query("SELECT evals.byok_revoke_for_deletion($1)",[scope.orgId]);
  // A workspace export (launch L-32) still waiting is not built for a workspace being deleted.
  await db.query("UPDATE evals.workspace_export SET status='failed',reason_code='workspace_deleted',updated_at=now() WHERE org_id=$1 AND status IN ('queued','running')",[scope.orgId]);
  await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'workspace.deletion_requested',$3)",[scope.orgId,scope.actorId,request.id]);
  return request;
 });
}

export function getDeletionRequest(scope:LifecycleScope){
 return withTenant(scope,async db=>(await db.query("SELECT id,status,requested_at,completed_at,summary FROM evals.deletion_request WHERE org_id=$1 ORDER BY requested_at DESC LIMIT 1",[scope.orgId])).rows[0]??null);
}

/** Runs a requested deletion to completion: stop, revoke, withdraw, delete objects, tombstone. */
export async function processDeletionRequests(scope:LifecycleScope){
 const request=await withTenant(scope,async db=>{
  const row=(await db.query("SELECT id FROM evals.deletion_request WHERE org_id=$1 AND status IN ('requested','processing') AND not_before<=now() ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED",[scope.orgId])).rows[0];
  if(!row)return null;
  await db.query("UPDATE evals.deletion_request SET status='processing' WHERE org_id=$1 AND id=$2",[scope.orgId,row.id]);
  const shares=(await db.query("UPDATE evals.share_grant SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND revoked_at IS NULL",[scope.orgId])).rowCount??0;
  const secrets=((await db.query("UPDATE evals.secret_record SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND revoked_at IS NULL",[scope.orgId])).rowCount??0)
   +Number((await db.query("SELECT evals.byok_revoke_for_deletion($1) AS revoked",[scope.orgId])).rows[0].revoked);
  const runs=(await db.query("UPDATE evals.run SET status='cancel_requested',updated_at=now() WHERE org_id=$1 AND status IN ('queued','running','pause_requested','paused')",[scope.orgId])).rowCount??0;
  const reports=(await db.query("UPDATE evals.report SET publication_status='withdrawn',updated_at=now() WHERE org_id=$1 AND publication_status<>'withdrawn'",[scope.orgId])).rowCount??0;
  // Launch L-19: API tokens (which may start runs) stop working and destinations stop sending.
  const tokens=(await db.query("UPDATE evals.customer_api_token SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND revoked_at IS NULL",[scope.orgId])).rowCount??0;
  const destinations=(await db.query("UPDATE evals.webhook_endpoint SET enabled=false,updated_at=now() WHERE org_id=$1 AND enabled",[scope.orgId])).rowCount??0;
  await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before)
   SELECT org_id,'artifact',id,'delete',now() FROM evals.artifact WHERE org_id=$1 AND state<>'deleted'
   ON CONFLICT(org_id,object_type,object_id,action) DO UPDATE SET not_before=LEAST(evals.retention_job.not_before,excluded.not_before)`,[scope.orgId]);
  // Stored workspace exports (launch L-32) go with the other files.
  await db.query("UPDATE evals.workspace_export SET status='failed',reason_code='workspace_deleted',updated_at=now() WHERE org_id=$1 AND status IN ('queued','running')",[scope.orgId]);
  await db.query(`INSERT INTO evals.retention_job(org_id,object_type,object_id,action,not_before)
   SELECT org_id,'workspace_export',id,'delete',now() FROM evals.workspace_export WHERE org_id=$1 AND object_key IS NOT NULL AND object_deleted_at IS NULL
   ON CONFLICT(org_id,object_type,object_id,action) DO UPDATE SET not_before=LEAST(evals.retention_job.not_before,excluded.not_before)`,[scope.orgId]);
  return {id:row.id as string,shares,secrets,runs,reports,tokens,destinations};
 });
 if(!request)return null;
 let deleted=0,failed=0;
 for(let pass=0;pass<50;pass++){const result=await processRetention(scope,100);deleted+=result.completed;failed+=result.failed;if(result.selected<100)break;}
 return withTenant(scope,async db=>{
  const remaining=Number((await db.query("SELECT (SELECT count(*) FROM evals.artifact WHERE org_id=$1 AND state<>'deleted')+(SELECT count(*) FROM evals.workspace_export WHERE org_id=$1 AND object_key IS NOT NULL AND object_deleted_at IS NULL) AS count",[scope.orgId])).rows[0].count);
  const summary={shares_revoked:request.shares,credentials_revoked:request.secrets,runs_stopped:request.runs,reports_withdrawn:request.reports,api_tokens_revoked:request.tokens,destinations_disabled:request.destinations,objects_deleted:deleted,objects_failed:failed,objects_remaining:remaining,backup_expiry:"Encrypted backups expire on their documented schedule; restores replay this deletion before serving data."};
  if(remaining>0){await db.query("UPDATE evals.deletion_request SET summary=$3 WHERE org_id=$1 AND id=$2",[scope.orgId,request.id,JSON.stringify(summary)]);return {id:request.id,status:"processing",summary};}
  await db.query("INSERT INTO evals.recovery_control_event(org_id,action,subject_type,subject_id,actor_id,payload_hash) VALUES($1,'workspace_deleted','workspace',$1,$2,$3) ON CONFLICT DO NOTHING",[scope.orgId,scope.actorId,sha256(canonicalJson({action:"workspace_deleted",id:scope.orgId,request:request.id}))]);
  await db.query("SELECT evals.tombstone_workspace($1,$2)",[scope.orgId,request.id]);
  await db.query("UPDATE evals.deletion_request SET status='completed',completed_at=now(),summary=$3 WHERE org_id=$1 AND id=$2",[scope.orgId,request.id,JSON.stringify(summary)]);
  await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'workspace.deleted',$3)",[scope.orgId,scope.actorId,request.id]);
  return {id:request.id,status:"completed",summary};
 });
}

/** One lifecycle pass for every workspace with due work. */
export async function tickLifecycle(actorId:string){
 const orgs=await lifecycleDueWorkspaces(actorId);const result={workspaces:orgs.length,scheduled:0,deleted:0,failed:0,deletions:0,captures:0};
 // Browser evidence screenshots expire after seven days across all workspaces.
 result.captures=await withTenant({orgId:"",actorId},async db=>Number((await db.query("SELECT evals.purge_expired_browser_captures() AS removed")).rows[0].removed));
 for(const orgId of orgs){const scope={orgId,actorId};
  result.scheduled+=await scheduleDueRetention(scope);
  const retention=await processRetention(scope,100);result.deleted+=retention.completed;result.failed+=retention.failed;
  if(await processDeletionRequests(scope))result.deletions++;
 }
 return result;
}
