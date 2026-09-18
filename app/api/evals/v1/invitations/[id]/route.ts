import { z } from 'zod';
import { api,requireWorkspace,EvalError } from '@/lib/evals/domain/http';
import { withTenant } from '@/lib/evals/repositories/db';
export const DELETE=api(async(request,identity)=>{
 const url=new URL(request.url);const id=z.uuid().parse(url.pathname.split('/').at(-1));const orgId=z.uuid().parse(url.searchParams.get('orgId'));
 await requireWorkspace(identity,orgId,'manage');
 return withTenant({orgId,actorId:identity.user.id},async client=>{
  const {rows}=await client.query('UPDATE evals.invitation SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND org_id=$2 RETURNING id',[id,orgId]);if(!rows.length) throw new EvalError('SCOPE_DENIED',404);
  await client.query('INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)',[orgId,identity.user.id,'invitation.revoked',id]);return rows[0];
 });
});
