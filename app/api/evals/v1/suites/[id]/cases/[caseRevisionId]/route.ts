import { z } from 'zod';
import { api, jsonBody, requireWorkspace } from '@/lib/evals/domain/http';
import { jsonValueSchema } from '@/lib/evals/contracts/primitives';
import { editSuiteDraftCase } from '@/lib/evals/repositories/evidence';

export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),title:z.string().trim().min(1).max(200),contents:z.array(z.string().max(2_000_000)).min(1).max(100),expected:jsonValueSchema}).parse(await jsonBody(request));
 const segments = new URL(request.url).pathname.split('/');
 const caseRevisionId = z.uuid().parse(segments.at(-1));
 const suiteId = z.uuid().parse(segments.at(-3));
 await requireWorkspace(identity,input.orgId,'write');
 return editSuiteDraftCase({orgId:input.orgId,actorId:identity.user.id},suiteId,caseRevisionId,{title:input.title,contents:input.contents,expected:input.expected},request.headers.get('Idempotency-Key') ?? '');
});
