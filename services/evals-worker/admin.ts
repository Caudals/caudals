import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { z } from 'zod';
import { withTenant } from '../../lib/evals/repositories/db';
import { registerAccount,registerProvider,registerPrice,writeSecret,revokeSecret,setBudget,enqueueProbe,reconcileUnknown,setGenerationProviderRoute } from '../../lib/evals/providers/admin';
import { loadKeyring } from '../../lib/evals/security/envelope';
import { controlWorkflow } from '../../lib/evals/queue/store';
/** Input JSON comes from stdin. Secret bytes are read from a protected file, never argv. */
async function main() {
 const command=z.enum(['account','provider','price','secret-write','secret-revoke','budget','probe','reconcile','control','generation-route']).parse(process.argv[2]);
 const tenant={orgId:z.string().uuid().parse(process.env.EVALS_ADMIN_ORG_ID),actorId:z.string().min(1).parse(process.env.EVALS_ADMIN_ACTOR_ID)};
 const connectionFile=z.string().min(1).parse(process.env.EVALS_ADMIN_DATABASE_URL_FILE);
 const pool=new Pool({connectionString:readFileSync(connectionFile,'utf8').trim(),max:1});
 const raw:unknown=JSON.parse(readFileSync(0,'utf8'));
 try {
  const result=await withTenant(tenant,async c=>{
   const role=(await c.query("SELECT current_user AS name,pg_has_role(current_user,'evals_runtime','MEMBER') AS web,evals.is_admin() AS admin")).rows[0];
   if(role.name==='evals_runtime'||role.web||!role.admin)throw new Error('dedicated_admin_role_required');
   switch(command) {
    case 'account':return registerAccount(c,tenant,raw);
    case 'provider':return registerProvider(c,tenant,raw,process.env.EVALS_DGX_ENDPOINT_FILE?readFileSync(process.env.EVALS_DGX_ENDPOINT_FILE,'utf8').trim():undefined);
    case 'price':return registerPrice(c,tenant,raw);
    case 'budget':return setBudget(c,tenant,raw);
    case 'probe':return enqueueProbe(c,tenant,raw);
    case 'generation-route':return setGenerationProviderRoute(c,tenant,raw);
    case 'reconcile':return reconcileUnknown(c,tenant,raw);
    case 'secret-revoke':return revokeSecret(c,tenant,z.object({recordId:z.string().uuid()}).strict().parse(raw).recordId);
    case 'secret-write':{
     const args=z.object({recordId:z.string().uuid().optional(),scopeId:z.string().uuid(),purpose:z.enum(['provider','target']),keyVersion:z.string().min(1)}).strict().parse(raw);
     const value=readFileSync(z.string().min(1).parse(process.env.EVALS_SECRET_VALUE_FILE));
     try{return await writeSecret(c,tenant,args,value,args.keyVersion,loadKeyring(z.string().min(1).parse(process.env.EVALS_MASTER_KEYRING_FILE)));}finally{value.fill(0);}
    }
    case 'control':{
     const args=z.object({workflowId:z.string().uuid(),action:z.enum(['pause','resume','cancel'])}).strict().parse(raw);
     await controlWorkflow(c,tenant.orgId,args.workflowId,args.action);return {id:args.workflowId};
    }
   }
  },pool);console.info(JSON.stringify(result));
 }finally{await pool.end();}
}
// Only stable snake_case codes are printed; driver or validation messages may echo input.
main().catch((error:unknown)=>{const message=error instanceof Error?error.message:'';console.error(JSON.stringify({event:'admin_command_failed',reason:error instanceof z.ZodError?'invalid_input':/^[a-z_]{3,64}$/.test(message)?message:'unexpected_error'}));process.exitCode=1;});
