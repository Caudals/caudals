import { z } from 'zod';
import { api,jsonBody } from '@/lib/evals/domain/http';
import { acceptInvitation } from '@/lib/evals/repositories/identity';
export const POST=api(async(request,identity)=>{
 const {token}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(await jsonBody(request));
 return acceptInvitation(identity,token);
});
