import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createReportForRun } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),runId:z.uuid(),title:z.string().min(1).max(200),reviewStatus:z.enum(["preliminary","reviewed"]),scorerVersion:z.string().min(1).max(200)}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"write");return createReportForRun({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get("idempotency-key")??"");});
