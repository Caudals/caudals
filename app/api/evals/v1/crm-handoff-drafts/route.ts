import { z } from "zod";
import { api,jsonBody,requireWorkspace,EvalError } from "@/lib/evals/domain/http";
import { createCrmHandoffDraft,listCrmHandoffDrafts } from "@/lib/evals/monitoring/crm";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  if(!identity.platformRole)throw new EvalError("SCOPE_DENIED",404);
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"manage");return listCrmHandoffDrafts({orgId,actorId:identity.user.id});
});
export const POST=api(async(request,identity)=>{
  if(!identity.platformRole)throw new EvalError("SCOPE_DENIED",404);
  const body=z.strictObject({orgId:z.uuid(),reportRevisionId:z.uuid()}).parse(await jsonBody(request));
  await requireWorkspace(identity,body.orgId,"manage");
  return createCrmHandoffDraft({orgId:body.orgId,actorId:identity.user.id},body.reportRevisionId);
});
