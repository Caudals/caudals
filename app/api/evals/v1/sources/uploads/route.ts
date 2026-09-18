import { safePathSchema } from '@/lib/evals/contracts/primitives';
import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),projectId:z.uuid(),title:z.string().min(1).max(200),exportPath:safePathSchema.optional(),visibility:z.enum(['internal','candidate','judge','customer']).default('internal'),rights:z.enum(['customer_owned','licensed','public_domain','caudals_owned']),mediaType:z.enum(['text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),byteSize:z.int().min(1).max(1048576),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await jsonBody(request));
 await requireWorkspace(identity,input.orgId,'write');
 return evidence.createUpload({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get('Idempotency-Key') ?? '');
});
