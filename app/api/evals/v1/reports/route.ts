import { z } from "zod";
import { api,EvalError,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createReportForRun } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),runId:z.uuid(),title:z.string().min(1).max(200),reviewStatus:z.enum(["preliminary","reviewed"]),scorerVersion:z.string().min(1).max(200)}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"write");if(input.reviewStatus==="reviewed"&&!identity.platformRole)throw new EvalError("SCOPE_DENIED",403,"A Caudals reviewer must release a reviewed report.");return createReportForRun({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get("idempotency-key")??"");});
