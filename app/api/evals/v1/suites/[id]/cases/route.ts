import { z } from 'zod';
import { api, requireWorkspace } from '@/lib/evals/domain/http';
import { getSuiteDraftCases } from '@/lib/evals/repositories/evidence';

export const runtime = 'nodejs';
export const GET = api(async (request, identity) => {
 const url = new URL(request.url);
 const orgId = z.uuid().parse(url.searchParams.get('orgId'));
 const id = z.uuid().parse(url.pathname.split('/').at(-2));
 await requireWorkspace(identity,orgId,'write');
 return getSuiteDraftCases({orgId,actorId:identity.user.id},id);
});
