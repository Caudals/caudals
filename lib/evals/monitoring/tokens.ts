import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sha256 } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";

export const customerTokenScope=z.enum(["runs:read","reports:read","schedules:read"]);
export type CustomerTokenScope=z.infer<typeof customerTokenScope>;
export const createCustomerTokenSchema=z.strictObject({name:z.string().trim().min(1).max(120),
  scopes:z.array(customerTokenScope).min(1).max(3),expiresAt:z.iso.datetime({offset:true})});
export function parseCustomerBearer(header:string|null){return header?.match(/^Bearer (evct_[A-Za-z0-9_-]{43})$/)?.[1]??null;}
export function isCustomerTokenUsable(row:{scopes:string[];expires_at:string|Date;revoked_at:string|Date|null},
  required:CustomerTokenScope,now=Date.now()){
  return !row.revoked_at&&new Date(row.expires_at).getTime()>now&&row.scopes.includes(required);
}
export function createCustomerToken(tenant:EvidenceScope,raw:unknown){
  const input=createCustomerTokenSchema.parse(raw),expiry=Date.parse(input.expiresAt),now=Date.now();
  if(expiry<now+5*60_000||expiry>now+366*86400_000)throw new EvalError("INPUT_INVALID",422,"Choose an expiry from five minutes to one year.");
  const token=`evct_${randomBytes(32).toString("base64url")}`;
  return withTenant(tenant,async db=>{
    const row=(await db.query(`INSERT INTO evals.customer_api_token(org_id,name,token_hash,scopes,expires_at)
      VALUES($1,$2,$3,$4,$5) RETURNING id,name,scopes,expires_at,created_at`,
      [tenant.orgId,input.name,sha256(token),[...new Set(input.scopes)],input.expiresAt])).rows[0];
    return {...row,token};
  });
}
export function listCustomerTokens(tenant:EvidenceScope){return withTenant(tenant,async db=>(await db.query(`SELECT id,name,scopes,expires_at,
  revoked_at,last_used_at,created_at FROM evals.customer_api_token WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100`,
  [tenant.orgId])).rows);}
export function revokeCustomerToken(tenant:EvidenceScope,id:string){return withTenant(tenant,async db=>{
  const row=(await db.query("UPDATE evals.customer_api_token SET revoked_at=COALESCE(revoked_at,now()) WHERE org_id=$1 AND id=$2 RETURNING id,revoked_at",
    [tenant.orgId,id])).rows[0];if(!row)throw new EvalError("SCOPE_DENIED",404);return row;
});}
export function authenticateCustomerToken(orgId:string,authorization:string|null,required:CustomerTokenScope){
  const token=parseCustomerBearer(authorization);if(!token)throw new EvalError("SCOPE_DENIED",401,"A customer API token is required.");
  return withTenant({orgId,actorId:"customer-api-token"},async db=>{
    const row=(await db.query("SELECT id,scopes,expires_at,revoked_at FROM evals.customer_api_token WHERE org_id=$1 AND token_hash=$2 FOR UPDATE",
      [orgId,sha256(token)])).rows[0];
    if(!row||!isCustomerTokenUsable(row,required))throw new EvalError("SCOPE_DENIED",403,"Token scope or validity is insufficient.");
    await db.query("UPDATE evals.customer_api_token SET last_used_at=now() WHERE org_id=$1 AND id=$2",[orgId,row.id]);
    return {orgId,tokenId:row.id as string};
  });
}
