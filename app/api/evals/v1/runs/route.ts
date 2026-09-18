import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createTargetAwareRun } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const body=await jsonBody(request,262144),orgId=z.uuid().parse((body as {orgId?:unknown}).orgId);await requireWorkspace(identity,orgId,"write");return createTargetAwareRun({orgId,actorId:identity.user.id},Object.fromEntries(Object.entries(body as object).filter(([key])=>key!=="orgId")),request.headers.get("idempotency-key")??"");});
