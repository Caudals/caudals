import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import { withTenant } from '@/lib/evals/repositories/db';
import { createWorkspace,createInvitation,acceptInvitation } from '@/lib/evals/repositories/identity';
import { requireWorkspace,type EvalIdentity } from '@/lib/evals/domain/identity';
import { createPrefixedId } from '@/lib/operator/ids';
import { POST as enroll } from '@/app/api/evals/v1/invitations/enroll/route';
const enabled=!!process.env.EVALS_TEST_DATABASE_URL;
describe.skipIf(!enabled)('evaluation identity real PostgreSQL',()=>{
 const owner=new Pool({connectionString:process.env.EVALS_TEST_DATABASE_URL,max:2});
 const operator:EvalIdentity={user:{id:createPrefixedId('au'),email:`${randomUUID()}@example.test`,name:'Fixture operator'},platformRole:'platform_admin',workspaces:[]};
 const viewer:EvalIdentity={user:{id:createPrefixedId('au'),email:`${randomUUID()}@example.test`,name:'Fixture viewer'},platformRole:null,workspaces:[]};
 let a:string;let b:string;
 beforeAll(async()=>{
  for(const identity of [operator,viewer]) await owner.query('INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[identity.user.id,identity.user.name,identity.user.email]);
  await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')",[operator.user.id]);
  a=(await createWorkspace(operator,'Fixture A',randomUUID())).id;b=(await createWorkspace(operator,'Fixture B',randomUUID())).id;
 });
 afterAll(async()=>{await owner.end();});
 it('creates a client without an account, idempotently',async()=>{
  const key=randomUUID();const x=await createWorkspace(operator,'No account needed',key);expect(await createWorkspace(operator,'No account needed',key)).toEqual(x);
  await expect(createWorkspace(operator,'Different',key)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await expect(createWorkspace(viewer,'Denied',randomUUID())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 });
 it('records a support read without mixing UUID and text parameter types',async()=>{
  await expect(requireWorkspace(operator,a,'read')).resolves.toBeUndefined();
  const audit=await owner.query("SELECT action,subject_id FROM evals.audit_event WHERE org_id=$1 AND actor_id=$2 AND action='support.read' ORDER BY created_at DESC LIMIT 1",[a,operator.user.id]);
  expect(audit.rows[0]).toEqual({action:'support.read',subject_id:a});
 });
 it('accepts a one-time invitation only for its verified recipient',async()=>{
  const invitation=await createInvitation(operator,a,viewer.user.email,'viewer',randomUUID());
  expect(invitation.token).toHaveLength(43);
  await expect(acceptInvitation(operator,invitation.token!)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  expect((await acceptInvitation(viewer,invitation.token!)).org_id).toBe(a);
  await expect(acceptInvitation(viewer,invitation.token!)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await expect(requireWorkspace(viewer,a,'read')).resolves.toBeUndefined();
  await expect(requireWorkspace(viewer,a,'write')).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await expect(requireWorkspace(viewer,b,'read')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 });
 it('expired and revoked invitations cannot grant membership',async()=>{
  for(const column of ['expires_at','revoked_at']){
   const invite=await createInvitation(operator,b,viewer.user.email,'editor',randomUUID());
   await owner.query(`UPDATE evals.invitation SET ${column}=now()-interval '1 second' WHERE id=$1`,[invite.id]);
   await expect(acceptInvitation(viewer,invite.token!)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  }
 });
 it('never persists the invitation bearer token, including idempotency',async()=>{
  const key=randomUUID();const invite=await createInvitation(operator,b,viewer.user.email,'viewer',key);
  const repeated=await createInvitation(operator,b,viewer.user.email,'viewer',key);expect(repeated.token).toBeNull();
  const stored=(await owner.query('SELECT token_hash FROM evals.invitation WHERE id=$1',[invite.id])).rows[0];
  expect(stored.token_hash).toBe(createHash('sha256').update(invite.token!).digest('hex'));
  const idem=(await owner.query('SELECT response FROM evals.idempotency WHERE key=$1',[key])).rows[0];expect(JSON.stringify(idem)).not.toContain(invite.token!);
 });
 it('enrolls a new identity atomically with one-time token and password hashing',async()=>{
  const email=`${randomUUID()}@example.test`;
  const invite=await createInvitation(operator,a,email,'viewer',randomUUID());
  const request=()=>new Request('http://localhost:3000/api/evals/v1/invitations/enroll',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({token:invite.token,name:'Invited fixture',password:'Synthetic-password-123'})});
  expect((await enroll(request())).status).toBe(200);
  expect((await enroll(request())).status).toBe(400);
  const row=(await owner.query('SELECT u.id,u."emailVerified",a.password,m.role FROM auth_user u JOIN auth_account a ON a."userId"=u.id JOIN evals.membership m ON m.user_id=u.id WHERE u.email=$1',[email])).rows[0];
  expect(row.emailVerified).toBe(true);expect(row.role).toBe('viewer');expect(row.password).not.toBe('Synthetic-password-123');
 });
 it('RLS filters guessed workspaces and cleans context on rollback/reuse',async()=>{
  const runtime=new Pool({connectionString:process.env.EVALS_DATABASE_URL,max:1});
  try{
   const rows=await withTenant({orgId:b,actorId:viewer.user.id},async c=>(await c.query('SELECT id FROM evals.workspace WHERE id=$1',[b])).rows,runtime);expect(rows).toEqual([]);
   await expect(withTenant({orgId:a,actorId:viewer.user.id},async()=>{throw new Error('rollback');},runtime)).rejects.toThrow('rollback');
   const settings=await runtime.query("SELECT nullif(current_setting('evals.org_id',true),'') AS org,nullif(current_setting('evals.actor_id',true),'') AS actor");expect(settings.rows[0]).toEqual({org:null,actor:null});
  }finally{await runtime.end();}
 });
 it('refuses a privileged runtime pool',async()=>{
  await expect(withTenant({orgId:a,actorId:operator.user.id},async()=>true,owner)).rejects.toThrow('non-owner');
 });
});
