import "server-only";
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenant } from './db';
import type { EvalIdentity } from '../domain/identity';
import { requireWorkspace } from '../domain/identity';
import { EvalError } from '../domain/errors';
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function idempotent<T>(client:PoolClient,actor:string,route:string,key:string|null,input:unknown,write:()=>Promise<T>):Promise<T> {
  if(!key||key.length<8||key.length>160) throw new EvalError('IDEMPOTENCY_REQUIRED',400,'Provide an Idempotency-Key of 8–160 characters.');
  const hash=digest(JSON.stringify(input));
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([actor,route,key])]);
  const {rows}=await client.query('SELECT request_hash,response FROM evals.idempotency WHERE actor_id=$1 AND route=$2 AND key=$3',[actor,route,key]);
  if(rows[0]) {if(rows[0].request_hash!==hash) throw new EvalError('VERSION_CONFLICT',409,'This request key was already used for different data.');return rows[0].response;}
  const result=await write();
  await client.query('INSERT INTO evals.idempotency(actor_id,route,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',[actor,route,key,hash,JSON.stringify(result)]);
  return result;
}
export async function createWorkspace(identity:EvalIdentity,name:string,key:string|null){
  if(!identity.platformRole) throw new EvalError('SCOPE_DENIED');
  return withTenant({orgId:'',actorId:identity.user.id},client=>idempotent(client,identity.user.id,'workspaces',key,{name},async()=>{
    const {rows}=await client.query<{id:string}>('SELECT evals.create_workspace($1) AS id',[name]);return {id:rows[0].id,name,role:'operator'};
  }));
}
export async function createInvitation(identity:EvalIdentity,orgId:string,email:string,role:string,key:string|null){
  await requireWorkspace(identity,orgId,'manage');
  // Only a digest is persisted. Replays return metadata, never the bearer token.
  const token=randomBytes(32).toString('base64url');let created=false;
  const result=await withTenant({orgId,actorId:identity.user.id},client=>idempotent(client,identity.user.id,`invitations/${orgId}`,key,{email,role},async()=>{
    const {rows}=await client.query('INSERT INTO evals.invitation(org_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval \'24 hours\',$5) RETURNING id,org_id,email,role,expires_at',[orgId,email,role,digest(token),identity.user.id]);
    await client.query('INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)',[orgId,identity.user.id,'invitation.created',rows[0].id]);created=true;return rows[0];
  }));
  return {...result,token:created?token:null};
}
export async function acceptInvitation(identity:EvalIdentity,token:string){
  return withTenant({orgId:'',actorId:identity.user.id},async client=>{
    try {const {rows}=await client.query('SELECT evals.accept_invitation($1) AS org_id',[digest(token)]);return rows[0];}
    catch {throw new EvalError('SCOPE_DENIED',404,'The invitation is unavailable, expired, or belongs to another account.');}
  });
}
