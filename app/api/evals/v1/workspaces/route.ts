import { z } from 'zod';
import { api,jsonBody } from '@/lib/evals/domain/http';
import { createWorkspace } from '@/lib/evals/repositories/identity';
export const GET=api(async(_request,identity)=>identity.workspaces);
export const POST=api(async(request,identity)=>{
 const {name}=z.object({name:z.string().trim().min(1).max(160)}).strict().parse(await jsonBody(request));
 return createWorkspace(identity,name,request.headers.get('idempotency-key'));
});
