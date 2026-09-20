import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { revokeCustomerToken } from "@/lib/evals/monitoring/tokens";
export const runtime="nodejs";
export const DELETE=api(async(request,identity)=>{
  const body=await jsonBody(request),orgId=z.uuid().parse((body as {orgId?:unknown})?.orgId),
    id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  await requireWorkspace(identity,orgId,"manage");return revokeCustomerToken({orgId,actorId:identity.user.id},id);
});
