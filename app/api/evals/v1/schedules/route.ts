import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createSchedule,listSchedules } from "@/lib/evals/monitoring/schedules";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"read");return listSchedules({orgId,actorId:identity.user.id});
});
export const POST=api(async(request,identity)=>{
  const body=await jsonBody(request),orgId=z.uuid().parse((body as {orgId?:unknown})?.orgId);
  await requireWorkspace(identity,orgId,"manage");
  return createSchedule({orgId,actorId:identity.user.id},Object.fromEntries(Object.entries(body as object).filter(([key])=>key!=="orgId")),request.headers.get("idempotency-key")??"");
});
