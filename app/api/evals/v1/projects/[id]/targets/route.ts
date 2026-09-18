import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import { addTarget } from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const input=z.strictObject({orgId:z.uuid(),title:z.string().min(1).max(200),targetId:z.uuid().optional(),config:z.unknown()}).parse(await jsonBody(request));
 const id=z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
 await requireWorkspace(identity,input.orgId,'write');
 return addTarget({orgId:input.orgId,actorId:identity.user.id},id,input,request.headers.get('Idempotency-Key')??'');
});
