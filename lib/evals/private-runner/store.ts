import "server-only";
import { createPublicKey, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { candidateInputSchema } from "../contracts/projections";
import { observationSchema } from "../contracts/results";
import { caseSchema } from "../contracts/cases";
import { targetConfigSchema } from "../contracts/connectors";
import { EvalError } from "../domain/errors";
import { withTenant, type TenantContext } from "../repositories/db";
import { newRunnerToken, publicKeyFor, runnerBundleSchema, runnerCompletionStatus, runnerUploadSchema, signPayload, tokenHash, verifyPayload, type RunnerBundle } from "./protocol";

function denied(): never { throw new EvalError("SCOPE_DENIED", 404); }
function signingKey() {
  const key = getSecretEnvValue("EVALS_RUNNER_SIGNING_KEY");
  if (!key) throw new EvalError("SERVICE_UNAVAILABLE", 503, "Private runner signing is not configured.");
  return key;
}
export function runnerSigningPublicKey() { return publicKeyFor(signingKey()); }

export async function createPairing(scope: TenantContext, targetId: string) {
  const code = newRunnerToken();
  return withTenant(scope, async db => {
    const target = (await db.query("SELECT id,project_id FROM evals.target WHERE org_id=$1 AND id=$2", [scope.orgId,targetId])).rows[0];
    if (!target) denied();
    const revision=(await db.query("SELECT document FROM evals.target_revision WHERE org_id=$1 AND target_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[scope.orgId,targetId])).rows[0];
    if(!revision || targetConfigSchema.parse(revision.document).kind!=="private_runner")
      throw new EvalError("CONNECTION_UNSUPPORTED",422,"Create a private-system connection before pairing a runner.");
    const row = (await db.query(`INSERT INTO evals.runner_pairing(org_id,project_id,target_id,code_hash,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '10 minutes') RETURNING id,expires_at`,[scope.orgId,target.project_id,targetId,tokenHash(code)])).rows[0];
    return { pairingId: row.id, code, expiresAt: row.expires_at, orgId: scope.orgId, targetId };
  });
}

export async function completePairing(orgId: string, code: string, publicKey: string, connectorVersion: string) {
  if (code.length > 256 || publicKey.length > 1024 || connectorVersion.length > 80) denied();
  try { if (createPublicKey(publicKey).asymmetricKeyType !== "ed25519") denied(); } catch { denied(); }
  const token = newRunnerToken();
  return withTenant({orgId,actorId:"runner-pair"}, async db => {
    const pairing = (await db.query(`SELECT * FROM evals.runner_pairing
      WHERE org_id=$1 AND code_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,[orgId,tokenHash(code)])).rows[0];
    if (!pairing) denied();
    const row = (await db.query(`INSERT INTO evals.runner_identity
      (org_id,project_id,target_id,public_key,token_hash,token_expires_at,connector_version)
      VALUES($1,$2,$3,$4,$5,now()+interval '30 days',$6)
      RETURNING id,token_expires_at`,[orgId,pairing.project_id,pairing.target_id,publicKey,tokenHash(token),connectorVersion])).rows[0];
    const current=(await db.query("SELECT document FROM evals.target_revision WHERE org_id=$1 AND target_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[orgId,pairing.target_id])).rows[0];
    if(!current)denied();
    const previous=targetConfigSchema.parse(current.document);
    if(previous.kind!=="private_runner" || previous.connector_version!==connectorVersion)denied();
    const targetRevisionId=randomUUID(),revision={...previous,target_revision_id:targetRevisionId,runner_id:row.id};
    await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
      [targetRevisionId,orgId,pairing.target_id,sha256(canonicalJson(revision)),revision]);
    await db.query("UPDATE evals.runner_pairing SET consumed_at=now() WHERE org_id=$1 AND id=$2",[orgId,pairing.id]);
    return { runnerId:row.id, orgId, projectId:pairing.project_id, targetId:pairing.target_id,
      targetRevisionId,token, tokenExpiresAt:row.token_expires_at, signingPublicKey:runnerSigningPublicKey() };
  });
}

export async function revokeRunner(scope: TenantContext, runnerId: string) {
  return withTenant(scope, async db => {
    const row=(await db.query("UPDATE evals.runner_identity SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND id=$2 RETURNING id,revoked_at",[scope.orgId,runnerId])).rows[0];
    if(!row) denied();
    await db.query("UPDATE evals.runner_job SET status='canceled' WHERE org_id=$1 AND runner_id=$2 AND status IN ('ready','claimed')",[scope.orgId,runnerId]);
    await db.query(`UPDATE evals.run SET reason_code='runner_revoked',updated_at=now()
      WHERE org_id=$1 AND id IN (SELECT run_id FROM evals.runner_job WHERE org_id=$1 AND runner_id=$2 AND status='canceled')
      AND status='paused'`,[scope.orgId,runnerId]);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'runner.revoked',$3)",[scope.orgId,scope.actorId,runnerId]);
    return {runnerId,revokedAt:row.revoked_at};
  });
}

export async function authenticateRunner<T>(orgId: string, token: string, callback: (db: PoolClient, runner: Record<string,unknown>) => Promise<T>) {
  if (!z.uuid().safeParse(orgId).success || token.length > 256 || token.length < 32) denied();
  return withTenant({orgId,actorId:"runner-auth"}, async db => {
    const runner=(await db.query(`SELECT id,org_id,project_id,target_id,public_key,connector_version
      FROM evals.runner_identity WHERE org_id=$1 AND token_hash=$2
        AND revoked_at IS NULL AND token_expires_at>now() FOR SHARE`,[orgId,tokenHash(token)])).rows[0];
    if(!runner) denied();
    await db.query("UPDATE evals.runner_identity SET last_seen_at=now() WHERE org_id=$1 AND id=$2",[orgId,runner.id]);
    return callback(db,runner);
  });
}

export async function createRunnerJob(db: PoolClient, scope: TenantContext, args: {
  runnerId:string; connectorVersion:string; projectId:string; targetId:string; targetRevisionId:string;
  runId:string; suiteVersionId:string; rows:Array<{case_revision_id:string;document:unknown}>;
}) {
  runnerSigningPublicKey(); // Fail before committing an unsignable job.
  const identity=(await db.query(`SELECT id FROM evals.runner_identity WHERE org_id=$1 AND id=$2
    AND project_id=$3 AND target_id=$4 AND connector_version=$5
    AND revoked_at IS NULL AND token_expires_at>now()`,
    [scope.orgId,args.runnerId,args.projectId,args.targetId,args.connectorVersion])).rows[0];
  if(!identity) denied();
  const target=(await db.query(`SELECT tr.document FROM evals.target_revision tr JOIN evals.target t
    ON (t.org_id,t.id)=(tr.org_id,tr.target_id) WHERE tr.org_id=$1 AND tr.id=$2
    AND t.id=$3 AND t.project_id=$4`,[scope.orgId,args.targetRevisionId,args.targetId,args.projectId])).rows[0];
  if(!target)denied();
  const config=targetConfigSchema.parse(target.document);
  if(config.kind!=="private_runner" || config.runner_id!==args.runnerId || config.connector_version!==args.connectorVersion)denied();
  const jobId=randomUUID(), nonce=randomBytes(32).toString("hex"), now=Date.now();
  const cases:RunnerBundle["cases"]=[];
  for(const row of args.rows) {
    const item=caseSchema.parse(row.document);
    if(item.scenario.mode!=="single_turn" || item.scenario.attachments.length || item.scenario.tool_fixture_set_id)
      throw new EvalError("CONNECTION_UNSUPPORTED",422,"This runner version supports text-only single-turn tests.");
    const input=candidateInputSchema.parse({schema_version:"1.0",case_id:item.case_id,case_revision_id:item.revision_id,
      messages:item.scenario.messages,attachments:[],tools:[]});
    for(let repetition=0;repetition<item.limits.repetitions;repetition++) {
      const caseUnitId=randomUUID();
      await db.query(`INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status)
        VALUES($1,$2,$3,$4,$5,'pending')`,[caseUnitId,scope.orgId,args.runId,item.revision_id,repetition]);
      cases.push({case_unit_id:caseUnitId,repetition,input});
    }
  }
  const payload=runnerBundleSchema.parse({schema_version:"1.0",job_id:jobId,org_id:scope.orgId,
    project_id:args.projectId,run_id:args.runId,suite_version_id:args.suiteVersionId,target_id:args.targetId,
    target_revision_id:args.targetRevisionId,nonce,issued_at:new Date(now).toISOString(),
    expires_at:new Date(now+24*3600_000).toISOString(),cases});
  const bundleHash=sha256(canonicalJson(payload));
  await db.query(`INSERT INTO evals.runner_job(id,org_id,project_id,runner_id,run_id,bundle_hash,bundle,nonce,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [jobId,scope.orgId,args.projectId,args.runnerId,args.runId,bundleHash,payload,nonce,payload.expires_at]);
  return {jobId,units:cases.length,bundleHash,expiresAt:payload.expires_at};
}

function signedJob(row: Record<string,unknown>) {
  const payload=runnerBundleSchema.parse(row.bundle);
  if(sha256(canonicalJson(payload))!==row.bundle_hash || Date.parse(payload.expires_at)<=Date.now()) denied();
  return {payload,signature:signPayload(payload,signingKey()),public_key:runnerSigningPublicKey()};
}
export function getOfflineBundle(scope: TenantContext, runId: string) {
  return withTenant(scope,async db=>{
    const job=(await db.query(`SELECT j.* FROM evals.runner_job j JOIN evals.runner_identity i
      ON (i.org_id,i.id)=(j.org_id,j.runner_id) WHERE j.org_id=$1 AND j.run_id=$2
      AND j.status IN ('ready','claimed') AND i.revoked_at IS NULL`,[scope.orgId,runId])).rows[0];
    if(!job) denied();
    return signedJob(job);
  });
}
export async function pollRunner(db:PoolClient,orgId:string,runnerId:string) {
  const row=(await db.query(`SELECT * FROM evals.runner_job WHERE org_id=$1 AND runner_id=$2
    AND status IN ('ready','claimed') AND expires_at>now() ORDER BY created_at,id LIMIT 1 FOR UPDATE`,[orgId,runnerId])).rows[0];
  if(!row)return {job:null};
  await db.query("UPDATE evals.runner_job SET status='claimed',claimed_at=COALESCE(claimed_at,now()) WHERE org_id=$1 AND id=$2",[orgId,row.id]);
  return {job:signedJob(row)};
}

export async function submitRunnerResult(db:PoolClient,runner:Record<string,unknown>,raw:unknown) {
  const upload=runnerUploadSchema.parse(raw);
  const signed={job_id:upload.job_id,case_unit_id:upload.case_unit_id,result:upload.result};
  if(!verifyPayload(signed,upload.signature,String(runner.public_key))) denied();
  const job=(await db.query(`SELECT j.*,r.target_revision_id,r.status AS run_status FROM evals.runner_job j
    JOIN evals.run r ON (r.org_id,r.id)=(j.org_id,j.run_id)
    WHERE j.org_id=$1 AND j.id=$2 AND j.runner_id=$3 FOR UPDATE`,
    [runner.org_id,upload.job_id,runner.id])).rows[0];
  if(!job || !["ready","claimed","completed"].includes(job.status) ||
    Date.parse(job.expires_at)<=Date.now() || ["canceled","cancel_requested"].includes(job.run_status)) denied();
  const payload=runnerBundleSchema.parse(job.bundle);
  if(sha256(canonicalJson(payload))!==job.bundle_hash)denied();
  const entry=payload.cases.find(item=>item.case_unit_id===upload.case_unit_id);
  if(!entry) denied();
  if(upload.result.messages.length<entry.input.messages.length ||
    canonicalJson(upload.result.messages.slice(0,entry.input.messages.length))!==canonicalJson(entry.input.messages))
    throw new EvalError("INPUT_INVALID",422,"The reported transcript does not match the frozen candidate input.");
  const unit=(await db.query(`SELECT * FROM evals.case_unit WHERE org_id=$1 AND id=$2 AND run_id=$3 FOR UPDATE`,
    [runner.org_id,upload.case_unit_id,job.run_id])).rows[0];
  if(!unit || unit.case_revision_id!==entry.input.case_revision_id || unit.repetition!==entry.repetition) denied();
  const payloadHash=sha256(canonicalJson(signed));
  const old=(await db.query("SELECT id,payload_hash FROM evals.runner_submission WHERE org_id=$1 AND job_id=$2 AND case_unit_id=$3",[runner.org_id,job.id,unit.id])).rows[0];
  if(old) {
    if(old.payload_hash!==payloadHash) throw new EvalError("VERSION_CONFLICT",409,"A different result is already committed for this test.");
    return {accepted:true,duplicate:true,submissionId:old.id};
  }
  if(unit.status!=="pending") throw new EvalError("VERSION_CONFLICT",409,"This test is already resolved.");
  const id=randomUUID(), document=observationSchema.parse(withContentHash({schema_version:"1.0",observation_id:id,
    run_id:job.run_id,case_revision_id:unit.case_revision_id,repetition:unit.repetition,attempt_id:randomUUID(),
    target_revision_id:job.target_revision_id,...upload.result,artifacts:[],
    extensions:{"caudals.evals/private_runner":{job_id:job.id,runner_id:runner.id,connector_version:runner.connector_version,
      execution_identity:"customer_runner_reported",signed_payload_hash:payloadHash}}}));
  await db.query(`INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,content_hash,document,execution_status)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,runner.org_id,job.run_id,unit.id,document.content_hash,document,document.status]);
  const submissionId=randomUUID();
  await db.query(`INSERT INTO evals.runner_submission(id,org_id,job_id,case_unit_id,observation_id,payload_hash,signature)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[submissionId,runner.org_id,job.id,unit.id,id,payloadHash,upload.signature]);
  await db.query("UPDATE evals.case_unit SET status=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[runner.org_id,unit.id,document.status]);
  const remaining=Number((await db.query("SELECT count(*)::int AS n FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 AND status='pending'",[runner.org_id,job.run_id])).rows[0].n);
  if(!remaining) {
    const counts=(await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='succeeded')::int AS succeeded FROM evals.case_unit WHERE org_id=$1 AND run_id=$2",[runner.org_id,job.run_id])).rows[0];
    await db.query("UPDATE evals.runner_job SET status='completed',completed_at=now() WHERE org_id=$1 AND id=$2",[runner.org_id,job.id]);
    await db.query("UPDATE evals.run SET status=$3,phase='grading',reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",
      [runner.org_id,job.run_id,runnerCompletionStatus(Number(counts.total),Number(counts.succeeded))]);
  } else await db.query("UPDATE evals.run SET status='paused',reason_code='runner_wait',updated_at=now() WHERE org_id=$1 AND id=$2",[runner.org_id,job.run_id]);
  return {accepted:true,duplicate:false,submissionId,remaining};
}
