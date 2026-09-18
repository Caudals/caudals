import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const {orgId} = z.strictObject({orgId:z.uuid()}).parse(await jsonBody(request));
 const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
 await requireWorkspace(identity,orgId,'write');
 return evidence.finalizeSource({orgId,actorId:identity.user.id},id,request.headers.get('Idempotency-Key') ?? '');
});
