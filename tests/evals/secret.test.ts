import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptSecret,decryptSecret,type SecretScope } from '../../lib/evals/security/envelope';
import { InvocationWorker } from '../../lib/evals/queue/worker';
import type { Invocation,ProviderRevision } from '../../lib/evals/providers/contracts';
import { fixture } from './worker-fixture';
import { stageAOwnerUrl } from './stage-a-env';
const keys=new Map([['v1',randomBytes(32)],['v2',randomBytes(32)]]);
const scope:SecretScope={orgId:randomUUID(),recordId:randomUUID(),versionId:randomUUID(),purpose:'provider',scopeId:randomUUID()};
it('envelope authenticates tenant, scope, purpose, record, version and key version',()=>{
 const secret=Buffer.from('never-persist-this-key'),encrypted=encryptSecret(secret,scope,'v1',keys);
 expect(JSON.stringify(encrypted)).not.toContain(secret.toString());
 expect(decryptSecret(encrypted,scope,keys)).toEqual(secret);
 for(const field of ['orgId','recordId','versionId','scopeId','purpose'] as const)expect(()=>decryptSecret(encrypted,{...scope,[field]:field==='purpose'?'target':randomUUID()},keys)).toThrow('secret_unavailable');
 expect(()=>decryptSecret({...encrypted,keyVersion:'v2'},scope,keys)).toThrow('secret_unavailable');
 expect(()=>decryptSecret({...encrypted,value:{...encrypted.value,data:'AAAA'}},scope,keys)).toThrow('secret_unavailable');
});
describe.skipIf(!stageAOwnerUrl)('tenant secret boundaries',()=>{
 it('decrypts only a reserved scoped invocation, clears the buffer, and honors revocation',async()=>{
  const f=await fixture();try {
   const recordId=randomUUID(),versionId=randomUUID();
   const encrypted=encryptSecret(Buffer.from('fixture-provider-key'),{orgId:f.orgId,recordId,versionId,purpose:'provider',scopeId:f.providerId},'v1',keys);
   await f.pool.query("INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,'provider',$3,'fixture')",[recordId,f.orgId,f.providerId]);
   await f.pool.query("INSERT INTO evals.secret_version(id,org_id,record_id,envelope,created_by) VALUES($1,$2,$3,$4,'fixture')",[versionId,f.orgId,recordId,encrypted]);
   let calls=0;let received:Buffer|undefined;
   const worker=new InvocationWorker({tx:f.tx,keys,actorId:f.tenant.actorId,workerId:randomUUID(),invoke:async(_p:ProviderRevision,_i:Invocation,secret:Buffer|undefined)=>{
    calls++;expect(secret?.toString()).toBe('fixture-provider-key');received=secret;
    return {text:'ok',complete:true,finishReason:'stop',latencyMs:1,usage:{input:1,output:1,cached:0}};
   }});
   const task=await f.enqueue({secretVersionId:versionId});await worker.handle(task.job);
   expect(calls).toBe(1);expect(received?.every(byte=>byte===0)).toBe(true);
   await f.pool.query('UPDATE evals.secret_record SET revoked_at=now() WHERE id=$1',[recordId]);
   const revoked=await f.enqueue({secretVersionId:versionId});await worker.handle(revoked.job);expect(calls).toBe(1);
   expect((await f.rows('SELECT reserved,settled FROM evals.execution_budget WHERE id=$1',[revoked.runBudgetId]))[0]).toEqual({reserved:'0.000000000',settled:'0.000000000'});
  }finally{await f.close();}
 },30000);
 it('hides ciphertext records across tenants under a non-owner role',async()=>{
  const f=await fixture();try{
   const recordId=randomUUID();await f.pool.query("INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,'provider',$3,'fixture')",[recordId,f.orgId,f.providerId]);
   const other=randomUUID();await f.pool.query('INSERT INTO evals.workspace(id) VALUES($1)',[other]);
   const rows=await f.tx({orgId:other,actorId:'fixture'},async c=>(await c.query('SELECT * FROM evals.secret_record WHERE id=$1',[recordId])).rows);
   expect(rows).toEqual([]);
   await expect(f.tx({orgId:other,actorId:'fixture'},c=>c.query("INSERT INTO evals.secret_record(org_id,purpose,scope_id,created_by) VALUES($1,'target',$2,'fixture')",[f.orgId,randomUUID()]))).rejects.toThrow(/permission denied|row-level security/);
  }finally{await f.close();}
 },30000);
});
