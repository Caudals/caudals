import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createReportShare } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),reportRevisionId:z.uuid(),recipient:z.email().optional(),audience:z.enum(["workspace","named_recipient","bearer"]),expiresAt:z.iso.datetime(),permittedFields:z.array(z.enum(["system","scope","metrics","findings","results","improvements","methodology","takeaways"])).min(1)}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,input.orgId,"manage");return createReportShare({orgId:input.orgId,actorId:identity.user.id},id,input,request.headers.get("idempotency-key")??"");});
