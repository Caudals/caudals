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
      (SELECT count(*) FROM evals.target_invocation_ledger l
        WHERE l.org_id=$1 AND l.target_revision_id=$2 AND l.provenance='current'
          AND l.state IN ('reserved','dispatched','unknown'))::int AS active,
      (SELECT count(*) FROM evals.target_invocation_ledger l
        WHERE l.org_id=$1 AND l.target_revision_id=$2 AND l.provenance='current'
          AND l.state='unknown')::int AS uncertain,
      ((SELECT count(*) FROM evals.target_invocation_ledger l
        WHERE l.org_id=$1 AND l.target_revision_id=$2 AND l.provenance='current'
          AND l.state<>'released' AND COALESCE(l.dispatched_at,l.claimed_at)>clock_timestamp()-interval '1 minute'
          AND NOT EXISTS (SELECT 1 FROM evals.target_invocation_call call
            WHERE (call.org_id,call.attempt_id)=(l.org_id,l.attempt_id)))
       + (SELECT count(*) FROM evals.target_invocation_call call
         JOIN evals.target_invocation_ledger parent
           ON (parent.org_id,parent.attempt_id)=(call.org_id,call.attempt_id)
         WHERE parent.org_id=$1 AND parent.target_revision_id=$2
           AND call.dispatched_at>clock_timestamp()-interval '1 minute'))::int AS recent,
      (SELECT min(COALESCE(l.dispatched_at,l.claimed_at)) FROM evals.target_invocation_ledger l
        WHERE l.org_id=$1 AND l.target_revision_id=$2 AND l.provenance='current'
          AND l.state<>'released' AND COALESCE(l.dispatched_at,l.claimed_at)>clock_timestamp()-interval '1 minute') AS next_slot`, [orgId,targetRevisionId]);
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
  const usage=await db.query<{calls:number;input_tokens:string|null;output_tokens:string|null;cost_amount:string|null;cost_currency:string|null;cost_provenance:string|null}>(`SELECT
    count(*)::int AS calls,
    CASE WHEN count(reported_input_tokens)=count(*) THEN sum(reported_input_tokens)::text ELSE NULL END AS input_tokens,
    CASE WHEN count(reported_output_tokens)=count(*) THEN sum(reported_output_tokens)::text ELSE NULL END AS output_tokens,
    CASE WHEN count(reported_cost_amount)=count(*) AND count(DISTINCT reported_cost_currency)=1
      THEN sum(reported_cost_amount)::text ELSE NULL END AS cost_amount,
    CASE WHEN count(reported_cost_amount)=count(*) AND count(DISTINCT reported_cost_currency)=1
      THEN min(reported_cost_currency) ELSE NULL END AS cost_currency,
    CASE WHEN count(reported_cost_amount)=count(*) AND count(DISTINCT reported_cost_currency)=1
      AND count(DISTINCT reported_cost_provenance)=1
      THEN min(reported_cost_provenance) ELSE NULL END AS cost_provenance
    FROM evals.target_invocation_call WHERE org_id=$1 AND attempt_id=$2 AND state='recorded'`,[scope.orgId,scope.attemptId]);
  const settled=usage.rows[0];
  if(settled.calls<1)throw new Error("target_call_dispatch_missing");
  const result=await db.query(`UPDATE evals.target_invocation_ledger SET
    state='recorded',reported_input_tokens=$3,reported_output_tokens=$4,
    reported_cost_amount=$5,reported_cost_currency=$6,reported_cost_provenance=$7,
    reason_code=$8,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state='dispatched'`,[
    scope.orgId,scope.attemptId,
    settled.input_tokens,settled.output_tokens,
    settled.cost_provenance?settled.cost_amount:null,settled.cost_provenance?settled.cost_currency:null,
    settled.cost_provenance,observation.error?.code??null,
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

export async function markTargetFailure(db:PoolClient,scope:Scope,reason:string,forceUnknown=false):Promise<void>{
  const result=await db.query(`UPDATE evals.target_invocation_ledger SET
    state=CASE WHEN state='reserved' THEN 'released'
      WHEN NOT $4::boolean
        AND EXISTS (SELECT 1 FROM evals.target_invocation_call call
          WHERE (call.org_id,call.attempt_id)=(target_invocation_ledger.org_id,target_invocation_ledger.attempt_id))
        AND NOT EXISTS (SELECT 1 FROM evals.target_invocation_call call
          WHERE (call.org_id,call.attempt_id)=(target_invocation_ledger.org_id,target_invocation_ledger.attempt_id)
            AND call.state<>'recorded') THEN 'recorded'
      ELSE 'unknown' END,
    reason_code=$3,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state IN ('reserved','dispatched')`,
  [scope.orgId,scope.attemptId,reason,forceUnknown]);
  if(result.rowCount!==1)throw new Error("target_usage_reservation_missing");
}

/** Commit one bounded row immediately before each external target request. */
export async function dispatchTargetCall(
  db: PoolClient,
  scope: Scope,
  ordinal: number,
  candidate: CandidateInput,
  outputTokenBound: number,
  requestsPerMinute: number,
): Promise<void> {
  const inputBytes = Buffer.byteLength(JSON.stringify(candidate.messages), "utf8");
  if (inputBytes < 1 || outputTokenBound < 1 || ordinal < 1 || requestsPerMinute < 1) throw new Error("target_usage_bound_missing");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`target-capacity:${scope.targetRevisionId}`]);
  const recent = await db.query<{ calls: number }>(`SELECT
    ((SELECT count(*) FROM evals.target_invocation_call call
      JOIN evals.target_invocation_ledger parent
        ON (parent.org_id,parent.attempt_id)=(call.org_id,call.attempt_id)
      WHERE parent.org_id=$1 AND parent.target_revision_id=$2
        AND call.dispatched_at>clock_timestamp()-interval '1 minute')
    + (SELECT count(*) FROM evals.target_invocation_ledger parent
      WHERE parent.org_id=$1 AND parent.target_revision_id=$2
        AND parent.attempt_id<>$3 AND parent.state<>'released'
        AND COALESCE(parent.dispatched_at,parent.claimed_at)>clock_timestamp()-interval '1 minute'
        AND NOT EXISTS (SELECT 1 FROM evals.target_invocation_call call
          WHERE (call.org_id,call.attempt_id)=(parent.org_id,parent.attempt_id))))::int AS calls`,
    [scope.orgId, scope.targetRevisionId, scope.attemptId]);
  if (recent.rows[0].calls >= requestsPerMinute) throw new Error("target_rate_limit_exhausted");
  const inserted = await db.query(`INSERT INTO evals.target_invocation_call
    (org_id,attempt_id,turn_ordinal,state,input_byte_bound,output_token_bound)
    SELECT $1,$2,$3,'dispatched',$4,$5
    FROM evals.target_invocation_ledger l
    JOIN evals.target_attempt a ON (a.org_id,a.id)=(l.org_id,l.attempt_id)
    JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    WHERE l.org_id=$1 AND l.attempt_id=$2 AND l.target_revision_id=$6
      AND l.provenance='current' AND l.state='dispatched'
      AND a.status='dispatching' AND a.fence=s.fence
      AND s.status='running' AND s.lease_until>now()
    RETURNING id`, [scope.orgId, scope.attemptId, ordinal, inputBytes, outputTokenBound, scope.targetRevisionId]);
  if (inserted.rowCount !== 1) throw new Error("target_call_dispatch_denied");
}

export async function recordTargetCall(
  db: PoolClient,
  scope: Scope,
  ordinal: number,
  observation: Observation,
): Promise<void> {
  const cost = observation.metadata.cost;
  const updated = await db.query(`UPDATE evals.target_invocation_call SET
    state='recorded',reported_input_tokens=$4,reported_output_tokens=$5,
    reported_cost_amount=$6,reported_cost_currency=$7,reported_cost_provenance=$8,
    reason_code=$9,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND turn_ordinal=$3 AND state='dispatched'`, [
    scope.orgId, scope.attemptId, ordinal,
    observation.metadata.input_tokens.value, observation.metadata.output_tokens.value,
    cost.value?.amount ?? null, cost.value?.currency ?? null,
    cost.value === null ? null : cost.provenance, observation.error?.code ?? null,
  ]);
  if (updated.rowCount !== 1) throw new Error("target_call_dispatch_missing");
}

export async function markTargetCallUnknown(
  db: PoolClient,
  scope: Scope,
  ordinal: number,
  reason: string,
): Promise<void> {
  await db.query(`UPDATE evals.target_invocation_call SET
    state='unknown',reason_code=$4,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND turn_ordinal=$3 AND state='dispatched'`,
  [scope.orgId, scope.attemptId, ordinal, reason]);
}

export async function recoverDispatchedTargetCalls(
  db: PoolClient,
  scope: Scope,
  reason: string,
): Promise<void> {
  await db.query(`UPDATE evals.target_invocation_call SET
    state='unknown',reason_code=$3,finished_at=now()
    WHERE org_id=$1 AND attempt_id=$2 AND state='dispatched'`,
  [scope.orgId, scope.attemptId, reason]);
}
