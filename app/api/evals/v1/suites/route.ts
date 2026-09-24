import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const POST = api(async (request, identity) => {
 const input = z.strictObject({orgId:z.uuid(),projectId:z.uuid(),title:z.string().min(1).max(200)}).parse(await jsonBody(request));
 await requireWorkspace(identity,input.orgId,'write');
 return evidence.createSuite({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get('Idempotency-Key') ?? '');
});

export const GET = api(async (request, identity) => {
 const url = new URL(request.url);
 const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const projectId = url.searchParams.has('projectId') ? z.uuid().parse(url.searchParams.get('projectId')) : undefined;
 await requireWorkspace(identity,orgId,'read');
 return evidence.listSuiteVersions({orgId,actorId:identity.user.id},projectId);
});
