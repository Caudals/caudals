import { createPrefixedId } from '@/lib/operator/ids';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { stageAOwnerUrl } from './stage-a-env';
const url=stageAOwnerUrl;
const pool=url ? new Pool({connectionString:url,max:1}) : undefined;
afterAll(async()=>{await pool?.end();});
async function fixture(fn:(db:PoolClient,a:string,b:string)=>Promise<void>) {
 const db=await pool!.connect(); const a=randomUUID(),b=randomUUID(),actor=createPrefixedId('au');
 try {
  await db.query('BEGIN');
  await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified","updatedAt") VALUES($1,$1,$2,true,now())',[actor,`${actor}@example.test`]);
  await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'A',$3),($2,'B',$3)",[a,b,actor]);
  await db.query('SET LOCAL ROLE evals_runtime');
  await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)",[a,actor]);
  await fn(db,a,b);
 } finally { await db.query('ROLLBACK'); db.release(); }
}
async function fails(db:PoolClient,sql:string,args:unknown[]) {
 await db.query('SAVEPOINT rejected');
 await expect(db.query(sql,args)).rejects.toThrow();
 await db.query('ROLLBACK TO SAVEPOINT rejected');
}
describe.skipIf(!url)('live PostgreSQL evidence isolation',()=>{
 it('RLS hides guessed IDs and rejects cross-tenant insertion and composite FKs',async()=>fixture(async(db,a,b)=>{
  const project=randomUUID();
  await db.query('INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,$3)',[project,a,'A']);
  await db.query("SELECT set_config('evals.org_id',$1,true)",[b]);
  expect((await db.query('SELECT * FROM evals.project WHERE id=$1',[project])).rowCount).toBe(0);
  await fails(db,'INSERT INTO evals.project(org_id,title) VALUES($1,$2)',[a,'forged']);
  await fails(db,'INSERT INTO evals.suite(org_id,project_id,title) VALUES($1,$2,$3)',[b,project,'cross tenant']);
  expect((await db.query('UPDATE evals.suite SET version=version+1 WHERE org_id=$1',[a])).rowCount).toBe(0);
 }));
 it('draft optimistic updates reject stale versions and revisions cannot mutate even with table privileges',async()=>fixture(async(db,a)=>{
  const p=(await db.query('INSERT INTO evals.project(org_id,title) VALUES($1,$2) RETURNING id',[a,'P'])).rows[0].id;
  const s=(await db.query('INSERT INTO evals.suite(org_id,project_id,title) VALUES($1,$2,$3) RETURNING id',[a,p,'S'])).rows[0].id;
  expect((await db.query("UPDATE evals.suite SET draft='{}',version=version+1 WHERE org_id=$1 AND id=$2 AND version=1",[a,s])).rowCount).toBe(1);
  expect((await db.query("UPDATE evals.suite SET draft='{}',version=version+1 WHERE org_id=$1 AND id=$2 AND version=1",[a,s])).rowCount).toBe(0);
  const r=(await db.query("INSERT INTO evals.rubric_revision(org_id,project_id,content_hash,document) VALUES($1,$2,$3,'{}') RETURNING id",[a,p,'a'.repeat(64)])).rows[0].id;
  await db.query('RESET ROLE');
  await fails(db,"UPDATE evals.rubric_revision SET document='{\"changed\":true}' WHERE id=$1",[r]);
  await fails(db,'DELETE FROM evals.rubric_revision WHERE id=$1',[r]);
 }));
 it('transaction-local scope is cleared before the pooled connection is reused',async()=>{
  await fixture(async(db)=>{ expect((await db.query('SELECT count(*) FROM evals.project')).rows[0].count).toBe('0'); });
  const db=await pool!.connect();
  try {
   await db.query('BEGIN'); await db.query('SET LOCAL ROLE evals_runtime');
   expect((await db.query('SELECT count(*) FROM evals.project')).rows[0].count).toBe('0');
  } finally {await db.query('ROLLBACK');db.release();}
 });
});

describe.skipIf(!url)('frozen evidence membership',()=>{
 it('binds exact case revisions and cannot be extended after freeze',async()=>fixture(async(db,a)=>{
  const project=(await db.query("INSERT INTO evals.project(org_id,title) VALUES($1,'P') RETURNING id",[a])).rows[0].id;
  const rubric=(await db.query("INSERT INTO evals.rubric_revision(org_id,project_id,content_hash,document) VALUES($1,$2,$3,'{}') RETURNING id",[a,project,'a'.repeat(64)])).rows[0].id;
  const caseId=(await db.query('INSERT INTO evals."case"(org_id,project_id) VALUES($1,$2) RETURNING id',[a,project])).rows[0].id;
  const revision=(await db.query("INSERT INTO evals.case_revision(org_id,case_id,rubric_revision_id,family_id,split,content_hash,document) VALUES($1,$2,$3,'family','holdout',$4,'{}') RETURNING id",[a,caseId,rubric,'b'.repeat(64)])).rows[0].id;
  const suite=(await db.query("INSERT INTO evals.suite(org_id,project_id,title) VALUES($1,$2,'S') RETURNING id",[a,project])).rows[0].id;
  const version=randomUUID();
  const manifest={suite_id:suite,suite_version_id:version,content_hash:'c'.repeat(64),case_revisions:[{case_id:caseId,revision_id:revision,content_hash:'b'.repeat(64),family_id:'family',split:'holdout'}],source_revisions:[],rubric_revisions:[{revision_id:rubric,content_hash:'a'.repeat(64)}]};
  await db.query('INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)',[version,a,suite,manifest.content_hash,manifest]);
  await db.query('INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)',[a,version,revision]);
  await fails(db,'INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,1)',[a,version,revision]);
  await db.query('RESET ROLE');
  await fails(db,"UPDATE evals.suite_version SET manifest='{}' WHERE id=$1",[version]);
  await fails(db,'DELETE FROM evals.case_revision WHERE id=$1',[revision]);
 }));
});
