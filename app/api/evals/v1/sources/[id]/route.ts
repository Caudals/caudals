import { z } from 'zod';
import { api, requireWorkspace, jsonBody } from '@/lib/evals/domain/http';
import * as evidence from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const GET = api(async (request, identity) => {
 const url = new URL(request.url); const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const id = z.uuid().parse(url.pathname.split('/').at(-1));
 await requireWorkspace(identity,orgId,'write');
 return evidence.getSource({orgId,actorId:identity.user.id},id);
});
