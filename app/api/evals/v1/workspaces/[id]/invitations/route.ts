import { z } from 'zod';
import { api,jsonBody,requireWorkspace } from '@/lib/evals/domain/http';
import { createInvitation } from '@/lib/evals/repositories/identity';
import { withTenant } from '@/lib/evals/repositories/db';
const org=(request:Request)=>z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
export const GET=api(async(request,identity)=>{
 const orgId=org(request);await requireWorkspace(identity,orgId,'manage');
 return withTenant({orgId,actorId:identity.user.id},async client=>(await client.query('SELECT id,email,role,expires_at,revoked_at,accepted_at FROM evals.invitation WHERE org_id=$1 ORDER BY created_at DESC,id LIMIT 100',[orgId])).rows);
});
export const POST=api(async(request,identity)=>{
 const {email,role}=z.object({email:z.email().max(254),role:z.enum(['owner','editor','viewer'])}).strict().parse(await jsonBody(request));
 return createInvitation(identity,org(request),email.toLowerCase(),role,request.headers.get('idempotency-key'));
});
