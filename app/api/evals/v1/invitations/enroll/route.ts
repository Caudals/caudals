import { createHash,randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { withTenant } from '@/lib/evals/repositories/db';
import { isEvaluationHost } from '@/lib/evals/domain/routing';
import { jsonBody,privateHeaders } from '@/lib/evals/domain/http';
import { createBetterAuthId } from '@/lib/auth/better-auth-ids';
// Bound expensive password hashing in the web process; invalid tokens never hash.
let enrolling=0;
export async function POST(request:Request) {
 const requestId=randomUUID();
 try {
  const host=request.headers.get('host');const origin=new URL(request.headers.get('origin')??'invalid');
  if(!isEvaluationHost(host)||origin.host!==host||(process.env.NODE_ENV==='production'&&origin.protocol!=='https:')) throw new Error('denied');
  const {token,name,password}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),name:z.string().trim().min(1).max(120),password:z.string().min(12).max(128)}).strict().parse(await jsonBody(request,2048));
  const hash=createHash('sha256').update(token).digest('hex');
  const permitted=await withTenant({orgId:'',actorId:''},async c=>(await c.query('SELECT evals.enrollment_allowed($1) AS permitted',[hash])).rows[0].permitted);
  if(!permitted||enrolling>=2) throw new Error('denied');
  enrolling++;
  try {
   const passwordHash=await hashPassword(password);
   const result=await withTenant({orgId:'',actorId:''},async c=>(await c.query('SELECT evals.enroll_invitation($1,$2,$3,$4,$5) AS org_id',[hash,name,passwordHash,createBetterAuthId({model:'user'}),createBetterAuthId({model:'account'})])).rows[0]);
   return Response.json({data:result,meta:{request_id:requestId}},{headers:privateHeaders});
  } finally {enrolling--;}
 } catch {
  return Response.json({error:{code:'INVITATION_UNAVAILABLE',message:'Use a valid invitation, or sign in to your existing account.',request_id:requestId,retryable:false}},{status:400,headers:privateHeaders});
 }
}
