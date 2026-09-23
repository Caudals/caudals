import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import https from "node:https";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pinnedLookup, validatePublicDestination } from "../connectors/egress";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";
import { decryptSecret, encryptSecret, loadKeyring, type Keyring } from "../security/envelope";
import { createWebhookSignature } from "./webhook-protocol";

const kinds=["run_completed","run_partial","run_unknown","regression","inconclusive"] as const;
export const createWebhookSchema=z.strictObject({label:z.string().trim().min(1).max(120),url:z.url().max(2048),
  events:z.array(z.enum(kinds)).min(1).max(kinds.length)});
export const updateWebhookSchema=z.strictObject({enabled:z.boolean().optional(),events:z.array(z.enum(kinds)).min(1).max(kinds.length).optional(),rotate:z.boolean().optional()});
function secretConfig(){
  const file=process.env.EVALS_WEBHOOK_KEYRING_FILE,version=process.env.EVALS_WEBHOOK_KEY_VERSION;
  if(!file||!version)throw new Error("webhook_keyring_unconfigured");
  // Loaded at use time so a mounted keyring can be rotated without an application restart.
  return {keys:loadKeyring(file),version};
}
function scope(orgId:string,endpointId:string,versionId:string){return {orgId,recordId:endpointId,versionId,purpose:"webhook" as const,scopeId:endpointId};}
export async function createWebhookEndpoint(tenant:EvidenceScope,raw:unknown){
  const input=createWebhookSchema.parse(raw);
  await validatePublicDestination(input.url);
  const {keys,version}=secretConfig(),secret=randomBytes(32),endpointId=randomUUID(),versionId=randomUUID();
  try{
    const result=await withTenant(tenant,async db=>{
      await db.query("INSERT INTO evals.webhook_endpoint(id,org_id,label,url,events) VALUES($1,$2,$3,$4,$5)",
        [endpointId,tenant.orgId,input.label,input.url,[...new Set(input.events)]]);
      await db.query("INSERT INTO evals.webhook_secret_version(id,org_id,endpoint_id,envelope) VALUES($1,$2,$3,$4)",
        [versionId,tenant.orgId,endpointId,encryptSecret(secret,scope(tenant.orgId,endpointId,versionId),version,keys)]);
      await db.query("UPDATE evals.webhook_endpoint SET current_secret_version_id=$3 WHERE org_id=$1 AND id=$2",[tenant.orgId,endpointId,versionId]);
      return {id:endpointId,label:input.label,url:input.url,events:[...new Set(input.events)],enabled:true};
    });
    return {...result,secret:secret.toString("base64url")};
  }finally{secret.fill(0);}
}
export function listWebhookEndpoints(tenant:EvidenceScope){return withTenant(tenant,async db=>(await db.query(`SELECT e.id,e.label,e.url,e.events,e.enabled,e.created_at,e.updated_at,
  (SELECT count(*)::int FROM evals.webhook_delivery d WHERE (d.org_id,d.endpoint_id)=(e.org_id,e.id) AND d.status='failed') AS failed_deliveries
  FROM evals.webhook_endpoint e WHERE e.org_id=$1 ORDER BY e.created_at DESC LIMIT 100`,[tenant.orgId])).rows);}
export async function updateWebhookEndpoint(tenant:EvidenceScope,id:string,raw:unknown){
  const input=updateWebhookSchema.parse(raw);
  if(!Object.keys(input).length)throw new EvalError("INPUT_INVALID",422);
  const config=input.rotate?secretConfig():null,secret=input.rotate?randomBytes(32):null,versionId=input.rotate?randomUUID():null;
  try{return await withTenant(tenant,async db=>{
    const endpoint=(await db.query("SELECT * FROM evals.webhook_endpoint WHERE org_id=$1 AND id=$2 FOR UPDATE",[tenant.orgId,id])).rows[0];
    if(!endpoint)throw new EvalError("SCOPE_DENIED",404);
    if(secret&&versionId&&config)await db.query("INSERT INTO evals.webhook_secret_version(id,org_id,endpoint_id,envelope) VALUES($1,$2,$3,$4)",
      [versionId,tenant.orgId,id,encryptSecret(secret,scope(tenant.orgId,id,versionId),config.version,config.keys)]);
    const row=(await db.query(`UPDATE evals.webhook_endpoint SET enabled=$3,events=$4,
      current_secret_version_id=$5,updated_at=now() WHERE org_id=$1 AND id=$2
      RETURNING id,label,url,events,enabled,updated_at`,[tenant.orgId,id,input.enabled??endpoint.enabled,
      input.events?[...new Set(input.events)]:endpoint.events,versionId??endpoint.current_secret_version_id])).rows[0];
    return {...row,...(secret?{secret:secret.toString("base64url")}:{})};
  });}finally{secret?.fill(0);}
}
/** Called in the same tenant transaction as the outcome, so retries never create extra events. */
export async function queueWebhookEvent(db:PoolClient,orgId:string,eventId:string,eventKind:typeof kinds[number],payload:Record<string,unknown>){
  const endpoints=(await db.query("SELECT id,current_secret_version_id FROM evals.webhook_endpoint WHERE org_id=$1 AND enabled AND $2=ANY(events)",
    [orgId,eventKind])).rows;
  const body={event_id:eventId,event_kind:eventKind,...payload},hash=sha256(canonicalJson(body));
  for(const endpoint of endpoints){
    await db.query(`INSERT INTO evals.webhook_delivery(org_id,endpoint_id,secret_version_id,event_id,event_kind,payload,payload_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(org_id,endpoint_id,event_id) DO NOTHING`,
      [orgId,endpoint.id,endpoint.current_secret_version_id,eventId,eventKind,body,hash]);
  }
}
export async function postWebhook(url:string,body:string,headers:Record<string,string>):Promise<number>{
  const destination=await validatePublicDestination(url);
  return new Promise((resolve,reject)=>{
    const req=https.request(destination.url,{method:"POST",agent:false,timeout:10000,
      lookup:pinnedLookup(destination),
      headers:{"content-type":"application/json","content-length":Buffer.byteLength(body),...headers}},response=>{
      response.resume();response.on("end",()=>resolve(response.statusCode??0));
    });
    req.on("timeout",()=>req.destroy(new Error("webhook_timeout")));req.on("error",reject);req.end(body);
  });
}
export async function tickWebhookDeliveries(tenant:EvidenceScope,keys:Keyring){
  const claimed=await withTenant(tenant,async db=>{
    await db.query(`UPDATE evals.webhook_delivery SET status='failed',reason_code='retry_limit',lease_until=NULL,
      updated_at=now() WHERE org_id=$1 AND status IN ('queued','retry','sending') AND attempt_count>=5
      AND (status<>'sending' OR lease_until<now())`,[tenant.orgId]);
    const rows=(await db.query(`SELECT d.*,e.url,e.enabled,sv.envelope FROM evals.webhook_delivery d
      JOIN evals.webhook_endpoint e ON (e.org_id,e.id)=(d.org_id,d.endpoint_id)
      JOIN evals.webhook_secret_version sv ON (sv.org_id,sv.id)=(d.org_id,d.secret_version_id)
      WHERE d.org_id=$1 AND d.status IN ('queued','retry','sending')
      AND d.attempt_count<5
      AND (d.status<>'sending' OR d.lease_until<now()) AND d.next_attempt_at<=now()
      ORDER BY d.next_attempt_at,d.id LIMIT 10 FOR UPDATE OF d SKIP LOCKED`,[tenant.orgId])).rows;
    for(const row of rows)await db.query("UPDATE evals.webhook_delivery SET status='sending',attempt_count=attempt_count+1,lease_until=now()+interval '30 seconds',updated_at=now() WHERE org_id=$1 AND id=$2",[tenant.orgId,row.id]);
    return rows;
  });
  for(const row of claimed){
    let status=0,reason:string|null=null;
    if(!row.enabled)reason="endpoint_disabled";
    else{
      let secret:Buffer|undefined;
      try{
        secret=decryptSecret(row.envelope,scope(tenant.orgId,row.endpoint_id,row.secret_version_id),keys);
        const body=canonicalJson(row.payload),timestamp=new Date().toISOString();
        status=await postWebhook(row.url,body,{"x-caudals-delivery-id":row.id,"x-caudals-timestamp":timestamp,
          "x-caudals-signature":createWebhookSignature(secret,row.id,timestamp,body)});
        if(status<200||status>=300)reason=status>=300&&status<400?"redirect_rejected":"http_error";
      }catch(error){reason=error instanceof Error&&error.message.startsWith("destination_")?"destination_denied":"delivery_error";}
      finally{secret?.fill(0);}
    }
    await withTenant(tenant,async db=>{
      const retry=reason&&row.enabled&&row.attempt_count+1<5;
      await db.query(`UPDATE evals.webhook_delivery SET status=$3,reason_code=$4,last_http_status=$5,
        next_attempt_at=CASE WHEN $6 THEN now()+($7::int*interval '1 minute') ELSE next_attempt_at END,
        delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
        lease_until=NULL,updated_at=now() WHERE org_id=$1 AND id=$2`,
        [tenant.orgId,row.id,reason?(retry?"retry":"failed"):"delivered",reason,status||null,retry,2**row.attempt_count]);
    });
  }
  return claimed.length;
}
