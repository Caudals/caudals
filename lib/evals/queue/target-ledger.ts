import type { PoolClient } from "pg";
import type { TargetConfig } from "../contracts/connectors";
import type { CandidateInput } from "../contracts/projections";
import type { Observation } from "../contracts/results";

type Scope = { orgId: string; runId: string; attemptId: string; targetRevisionId: string };
type Capacity = { kind: "ready" } | { kind: "wait"; until: Date } | { kind: "review" };

/** Serialize claims for one immutable target revision across worker replicas. */
export async function targetCapacity(
  db: PoolClient,
  orgId: string,
  targetRevisionId: string,
  config: TargetConfig,
): Promise<Capacity> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`target-capacity:${targetRevisionId}`]);
  const { rows } = await db.query<{
    active: number;
    uncertain: number;
    recent: number;
    next_slot: Date | null;
  }>(`
    SELECT
      count(*) FILTER (WHERE state IN ('reserved','dispatched','unknown'))::int AS active,
      count(*) FILTER (WHERE state='unknown')::int AS uncertain,
      count(*) FILTER (WHERE state<>'released' AND
        COALESCE(dispatched_at,claimed_at)>clock_timestamp()-interval '1 minute')::int AS recent,
      min(COALESCE(dispatched_at,claimed_at)) FILTER (WHERE state<>'released' AND
        COALESCE(dispatched_at,claimed_at)>clock_timestamp()-interval '1 minute') AS next_slot
    FROM evals.target_invocation_ledger
    WHERE org_id=$1 AND target_revision_id=$2 AND provenance='current'`, [orgId,targetRevisionId]);
  const current=rows[0];
  if (current.active >= config.concurrent_sessions && current.uncertain > 0) return {kind:"review"};
  if (current.active >= config.concurrent_sessions) return {kind:"wait",until:new Date(Date.now()+2000)};
  if (current.recent >= config.requests_per_minute) {
    return {kind:"wait",until:new Date(Math.max(Date.now()+1000,
      (current.next_slot?.getTime()??Date.now())+60100))};
  }
  return {kind:"ready"};
}

/** No target request may be dispatched until this row is committed. */
export async function reserveTargetInvocation(
  db: PoolClient,
  scope: Scope,
  config: TargetConfig,
  candidate: CandidateInput,
): Promise<void> {
  const inputBytes=Buffer.byteLength(JSON.stringify(candidate.messages),"utf8");
  if (inputBytes<1 || config.limits.max_output_tokens<1 || config.limits.max_turns<1)
    throw new Error("target_usage_bound_missing");
  await db.query(`INSERT INTO evals.target_invocation_ledger
    (org_id,attempt_id,run_id,target_revision_id,state,provenance,
     input_byte_bound,output_token_bound,turn_bound,tool_call_bound)
    VALUES($1,$2,$3,$4,'reserved','current',$5,$6,$7,$8)`,
  [scope.orgId,scope.attemptId,scope.runId,scope.targetRevisionId,inputBytes,
    config.limits.max_output_tokens,config.limits.max_turns,config.limits.max_tool_calls]);
}

export async function markTargetDispatched(db:PoolClient,scope:Scope):Promise<void>{
  const result=await db.query(`UPDATE evals.target_invocation_ledger
    SET state='dispatched',dispatched_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state='reserved'`,[scope.orgId,scope.attemptId]);
  if(result.rowCount!==1)throw new Error("target_usage_reservation_missing");
}

export async function recordTargetObservation(db:PoolClient,scope:Scope,observation:Observation):Promise<void>{
  const cost=observation.metadata.cost;
  const result=await db.query(`UPDATE evals.target_invocation_ledger SET
    state='recorded',reported_input_tokens=$3,reported_output_tokens=$4,
    reported_cost_amount=$5,reported_cost_currency=$6,reported_cost_provenance=$7,
    reason_code=$8,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state='dispatched'`,[
    scope.orgId,scope.attemptId,
    observation.metadata.input_tokens.value,observation.metadata.output_tokens.value,
    cost.value?.amount??null,cost.value?.currency??null,
    cost.value===null?null:cost.provenance,observation.error?.code??null,
  ]);
  if(result.rowCount!==1)throw new Error("target_usage_dispatch_missing");
}

export async function releaseTargetClaim(db:PoolClient,scope:Scope,reason:string):Promise<void>{
  const result=await db.query(`UPDATE evals.target_invocation_ledger SET
    state='released',reason_code=$3,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state='reserved'`,
  [scope.orgId,scope.attemptId,reason]);
  if(result.rowCount!==1)throw new Error("target_usage_reservation_missing");
}

export async function markTargetFailure(db:PoolClient,scope:Scope,reason:string):Promise<void>{
  const result=await db.query(`UPDATE evals.target_invocation_ledger SET
    state=CASE WHEN state='reserved' THEN 'released' ELSE 'unknown' END,
    reason_code=$3,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state IN ('reserved','dispatched')`,
  [scope.orgId,scope.attemptId,reason]);
  if(result.rowCount!==1)throw new Error("target_usage_reservation_missing");
}
