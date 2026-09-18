import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
import { manifestSchema } from '@/lib/evals/contracts/manifest';
export const GET = api(async (request, identity) => {
 const url = new URL(request.url); const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const id = z.uuid().parse(url.pathname.split('/').at(-2));
 await requireWorkspace(identity,orgId,'write');
 return evidence.getDraft({orgId,actorId:identity.user.id},id);
});
export const PATCH = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),version:z.int().positive(),draft:manifestSchema}).parse(await jsonBody(request));
 const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
 await requireWorkspace(identity,input.orgId,'write');
 return evidence.patchDraft({orgId:input.orgId,actorId:identity.user.id},id,input.version,input.draft);
});
