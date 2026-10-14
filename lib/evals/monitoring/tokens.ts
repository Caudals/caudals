import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import "server-only";
import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import { sha256 } from "../contracts/hashing";
import { EvalError, inputError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { CUSTOMER_API_LIMITS, CUSTOMER_TOKEN_SCOPES } from "./customer-api";
import { integrationsV2Enabled } from "./integrations-flag";

export const customerTokenScope=z.enum(CUSTOMER_TOKEN_SCOPES);
export type CustomerTokenScope=z.infer<typeof customerTokenScope>;
export const createCustomerTokenSchema=z.strictObject({name:z.string().trim().min(1).max(120),
  scopes:z.array(customerTokenScope).min(1).max(CUSTOMER_TOKEN_SCOPES.length),expiresAt:z.iso.datetime({offset:true})});
export function parseCustomerBearer(header:string|null){return header?.match(/^Bearer (evct_[A-Za-z0-9_-]{43})$/)?.[1]??null;}
/** Usable for `required` (or, given several, for any one of them) until it expires or is revoked. */
export function isCustomerTokenUsable(row:{scopes:string[];expires_at:string|Date;revoked_at:string|Date|null},
  required:CustomerTokenScope|readonly CustomerTokenScope[],now=Date.now()){
  const accepted:readonly string[]=typeof required==="string"?[required]:required;
  return !row.revoked_at&&new Date(row.expires_at).getTime()>now&&row.scopes.some(scope=>accepted.includes(scope));
}
/**
 * Creates a token; the value is returned once. `runs:write` (launch L-19)
 * starts runs that spend credits, so it needs INTEGRATIONS_V2_ENABLED and
 * expires within 90 days. Audited (`api_token.created`, scopes and expiry).
 */
export async function createCustomerToken(tenant:EvidenceScope,raw:unknown){
  const input=createCustomerTokenSchema.parse(raw),expiry=Date.parse(input.expiresAt),now=Date.now(),scopes=[...new Set(input.scopes)];
  const write=scopes.includes("runs:write");
  if(write&&!integrationsV2Enabled())throw new EvalError("INPUT_INVALID",422,"This scope is not available.");
  if(expiry<now+CUSTOMER_API_LIMITS.tokenMinMinutes*60_000||expiry>now+CUSTOMER_API_LIMITS.tokenMaxDays*86400_000)throw new EvalError("INPUT_INVALID",422,"Choose an expiry from five minutes to one year.");
  if(write&&expiry>now+CUSTOMER_API_LIMITS.writeTokenMaxDays*86400_000)throw new EvalError("INPUT_INVALID",422,`A token that starts runs must expire within ${CUSTOMER_API_LIMITS.writeTokenMaxDays} days.`);
  const token=`evct_${randomBytes(32).toString("base64url")}`;
  return withTenant(tenant,async db=>{
    const row=(await db.query(`INSERT INTO evals.customer_api_token(org_id,name,token_hash,scopes,expires_at)
      VALUES($1,$2,$3,$4,$5) RETURNING id,name,scopes,expires_at,created_at`,
      [tenant.orgId,input.name,sha256(token),scopes,input.expiresAt])).rows[0];
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'api_token.created',$3,$4)",
      [tenant.orgId,tenant.actorId,row.id,{scopes,expires_at:input.expiresAt}]);
    await recordProductEvent({ eventName: "api_token_created", source: "server", orgId: tenant.orgId, eventKey: row.id, payload: { destination_type: write ? "ci" : "api" } }, db);
    return {...row,token};
  });
}
export function listCustomerTokens(tenant:EvidenceScope){return withTenant(tenant,async db=>(await db.query(`SELECT id,name,scopes,expires_at,
  revoked_at,last_used_at,created_at FROM evals.customer_api_token WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100`,
  [tenant.orgId])).rows);}
export function revokeCustomerToken(tenant:EvidenceScope,id:string){return withTenant(tenant,async db=>{
  const before=(await db.query("SELECT revoked_at FROM evals.customer_api_token WHERE org_id=$1 AND id=$2 FOR UPDATE",[tenant.orgId,id])).rows[0];
  if(!before)throw new EvalError("SCOPE_DENIED",404);
  const row=(await db.query("UPDATE evals.customer_api_token SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND id=$2 RETURNING id,revoked_at",
    [tenant.orgId,id])).rows[0];
  if(!before.revoked_at)await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'api_token.revoked',$3)",[tenant.orgId,tenant.actorId,id]);
  return row;
});}
/** Too many requests for one token (launch L-20): answered 429 with Retry-After. */
export class CustomerApiRateLimited extends EvalError {
  constructor(public retryAfterSeconds:number){super("RATE_LIMITED",429,`Too many requests for this token. Try again in ${retryAfterSeconds} seconds.`);}
}
/** Extra response headers for a token endpoint's error. */
export function customerApiErrorHeaders(error:unknown):Record<string,string>{
  return error instanceof CustomerApiRateLimited?{"Retry-After":String(error.retryAfterSeconds)}:{};
}
export async function authenticateCustomerToken(orgId:string,authorization:string|null,required:CustomerTokenScope|readonly CustomerTokenScope[]){
  const token=parseCustomerBearer(authorization);if(!token)throw new EvalError("SCOPE_DENIED",401,"A customer API token is required.");
  const result=await withTenant({orgId,actorId:"customer-api-token"},async db=>{
    const row=(await db.query("SELECT id,scopes,expires_at,revoked_at FROM evals.customer_api_token WHERE org_id=$1 AND token_hash=$2 FOR UPDATE",
      [orgId,sha256(token)])).rows[0];
    if(!row||!isCustomerTokenUsable(row,required))throw new EvalError("SCOPE_DENIED",403,"Token scope or validity is insufficient.");
    await db.query("UPDATE evals.customer_api_token SET last_used_at=now() WHERE org_id=$1 AND id=$2",[orgId,row.id]);
    return {orgId,tokenId:row.id as string};
  });
  // One budget per token across every token endpoint, counted after the token is known to be valid.
  const limit=await consumeRateLimit({key:`customer-api:${result.tokenId}`,limit:CUSTOMER_API_LIMITS.requestsPerWindow,windowMs:CUSTOMER_API_LIMITS.windowSeconds*1000});
  if(!limit.allowed)throw new CustomerApiRateLimited(limit.retryAfterSeconds);
  return result;
}
/**
 * The error body of a token endpoint (launch L-19): `{error:{code,message}}`,
 * with Retry-After on 429. Input problems are 400/422 with their message;
 * anything unexpected is 503 without details.
 */
export function customerApiErrorResponse(caught:unknown,headers:Record<string,string>){
  const error=inputError(caught)??caught;
  const known=error instanceof EvalError,validation=error instanceof ZodError||error instanceof SyntaxError;
  if(!known&&!validation)console.error("customer_api_request_failed",{error_type:error instanceof Error?error.name:typeof error});
  return Response.json({error:{code:known?error.code:validation?"INPUT_INVALID":"SERVICE_UNAVAILABLE",
    message:known?error.message:validation?"Check the supplied fields.":"The service is temporarily unavailable."}},
  {status:known?error.status:validation?400:503,headers:{...headers,...customerApiErrorHeaders(error)}});
}
