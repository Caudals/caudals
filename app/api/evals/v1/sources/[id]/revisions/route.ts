import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import { reviseSource } from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const input=z.strictObject({orgId:z.uuid(),artifactId:z.uuid()}).parse(await jsonBody(request));
 const id=z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
 await requireWorkspace(identity,input.orgId,'write');
 return reviseSource({orgId:input.orgId,actorId:identity.user.id},id,input.artifactId,request.headers.get('Idempotency-Key')??'');
});
