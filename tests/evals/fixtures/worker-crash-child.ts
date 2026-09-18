import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { InvocationWorker } from '../../../lib/evals/queue/worker';
import { withTenant } from '../../../lib/evals/repositories/db';
import type { TenantTransaction } from '../../../lib/evals/queue/store';
const pool=new Pool({connectionString:process.env.EVALS_CRASH_DATABASE_URL,max:1});
pool.on('connect',client=>{void client.query('SET ROLE evals_worker');});
const mode=process.env.EVALS_CRASH_MODE;
const waitForever=()=>new Promise<never>(()=>{setInterval(()=>{},1000);});
const tx:TenantTransaction=async(tenant,fn)=>{
 const result=await withTenant(tenant,fn,pool).catch(error=>{process.send?.({db_error:error.message});throw error;});
 if(mode==='before'&&result&&typeof result==='object'&&'attemptId' in result){process.send?.('reserved');await waitForever();}
 return result;
};
const worker=new InvocationWorker({tx,keys:new Map(),actorId:'worker-fixture',workerId:randomUUID(),leaseSeconds:5,invoke:async()=>{process.send?.('accepted');return waitForever();}});
worker.handle(JSON.parse(process.env.EVALS_CRASH_JOB!)).catch((error)=>{process.send?.({failed:error instanceof Error?error.message:'failed'});process.exit(1);});
