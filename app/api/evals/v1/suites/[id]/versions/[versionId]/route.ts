import { z } from 'zod';
import { api, requireWorkspace } from '@/lib/evals/domain/http';
import { getSuiteVersion } from '@/lib/evals/repositories/evidence';
export const runtime = 'nodejs';
export const GET = api(async (request, identity) => {
 const url=new URL(request.url),parts=url.pathname.split('/');
 const orgId=z.uuid().parse(url.searchParams.get('orgId')), id=z.uuid().parse(parts.at(-3)),versionId=z.uuid().parse(parts.at(-1));
 await requireWorkspace(identity,orgId,'write');
 return getSuiteVersion({orgId,actorId:identity.user.id},id,versionId);
});
