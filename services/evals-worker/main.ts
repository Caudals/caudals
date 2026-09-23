import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { getEvalsPool, withTenant } from '../../lib/evals/repositories/db';
import { createBoss, dispatchOutbox, startBoss, type JobData } from '../../lib/evals/queue/boss';
import { InvocationWorker } from '../../lib/evals/queue/worker';
import { loadKeyring } from '../../lib/evals/security/envelope';
import { TargetExecutionWorker } from '../../lib/evals/queue/target-worker';

async function main() {
 if(process.env.EVALS_DISPATCH_ENABLED!=='true')throw new Error('dispatch_disabled');
 // Explicit operator-assigned workspaces: the worker cannot discover arbitrary tenant data.
 const orgs=z.array(z.string().uuid()).min(1).parse(JSON.parse(process.env.EVALS_WORKER_ORG_IDS??'[]'));
 const actorId=z.string().min(1).parse(process.env.EVALS_WORKER_ACTOR_ID);
 const keyFile=z.string().min(1).parse(process.env.EVALS_MASTER_KEYRING_FILE);
 const endpointFile=process.env.EVALS_DGX_ENDPOINT_FILE;
 const dgxEndpoint=endpointFile?readFileSync(endpointFile,'utf8').trim():undefined;
 const boss=createBoss();boss.on('error',()=>console.error(JSON.stringify({event:'queue_error'})));
 const keys=loadKeyring(keyFile),
   worker=new InvocationWorker({tx:withTenant,keys,actorId,workerId:randomUUID(),dgxEndpoint}),targetWorker=new TargetExecutionWorker({tx:withTenant,keys,actorId,workerId:randomUUID()});
 try {
 await startBoss(boss);
 for(const queue of ['execute_api','generate','profile','grade'])await boss.work<JobData>(queue,{batchSize:1,pollingIntervalSeconds:2},async (jobs: any[])=>{
  for(const job of jobs){if(!orgs.includes(job.data.orgId))throw new Error('worker_tenant_denied');if(queue==='execute_api'&&await targetWorker.canHandle(job.data))await targetWorker.handle(job.data);else await worker.handle(job.data);}
 });
 let stopping=false;
 const stop=()=>{stopping=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 console.info(JSON.stringify({event:'worker_ready',environment:process.env.EVALS_ENV}));
  while(!stopping) {
   for(const orgId of orgs) {
    const tenant={orgId,actorId};await targetWorker.recover(tenant);await worker.recover(tenant);await dispatchOutbox(boss,withTenant,tenant,10);
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }finally{await boss.stop({graceful:true,timeout:150000});await getEvalsPool().end();}
}
main().catch(()=>{console.error(JSON.stringify({event:'worker_stopped',reason:'configuration_or_runtime_failure'}));process.exitCode=1;});
