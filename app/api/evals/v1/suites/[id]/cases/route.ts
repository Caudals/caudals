import { z } from 'zod';
import { api, requireWorkspace } from '@/lib/evals/domain/http';
import { addSuiteDraftCase, getSuiteDraftCases } from '@/lib/evals/repositories/evidence';
import { jsonBody } from '@/lib/evals/domain/http';
import { referenceEditSchema } from '@/lib/evals/contracts/reference-edits';

export const runtime = 'nodejs';
export const GET = api(async (request, identity) => {
 const url = new URL(request.url);
 const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const id = z.uuid().parse(url.pathname.split('/').at(-2));
 await requireWorkspace(identity,orgId,'write');
 return getSuiteDraftCases({orgId,actorId:identity.user.id},id);
});

// Add a question to an editable draft.
export const POST = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),title:z.string().trim().min(1).max(200),question:z.string().trim().min(3).max(20000),expected:z.string().trim().min(1).max(20000),severity:z.enum(['low','medium','high','critical']).default('medium'),...referenceEditSchema.shape}).parse(await jsonBody(request));
 const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
 await requireWorkspace(identity,input.orgId,'write');
 const { orgId, ...rest } = input;
 return addSuiteDraftCase({orgId,actorId:identity.user.id},id,rest,request.headers.get('Idempotency-Key') ?? '');
});
