import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { updateSchedule } from "@/lib/evals/monitoring/schedules";
export const runtime="nodejs";
export const PATCH=api(async(request,identity)=>{
  const body=await jsonBody(request),orgId=z.uuid().parse((body as {orgId?:unknown})?.orgId),
    id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  await requireWorkspace(identity,orgId,"manage");
  return updateSchedule({orgId,actorId:identity.user.id},id,Object.fromEntries(Object.entries(body as object).filter(([key])=>key!=="orgId")));
});
