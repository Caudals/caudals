import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const GET = api(async (request, identity) => {
 const url = new URL(request.url); const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const after = z.uuid().optional().parse(url.searchParams.get('after') ?? undefined);
 await requireWorkspace(identity, orgId, 'read');
 return evidence.listProjects({orgId,actorId:identity.user.id},after);
});
export const POST = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),title:z.string().min(1).max(200),description:z.string().max(10000).default('')}).parse(await jsonBody(request));
 await requireWorkspace(identity,input.orgId,'write');
 return evidence.createProject({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get('Idempotency-Key') ?? '');
});
