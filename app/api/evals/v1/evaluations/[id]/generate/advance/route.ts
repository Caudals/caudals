import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { advanceAutomaticGeneration } from "@/lib/evals/repositories/automatic-generation";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{
 const input=z.strictObject({orgId:z.uuid(),jobId:z.uuid()}).parse(await jsonBody(request));
 const evaluationId=z.uuid().parse(new URL(request.url).pathname.split("/").at(-3));
 await requireWorkspace(identity,input.orgId,"write");
 return advanceAutomaticGeneration({orgId:input.orgId,actorId:identity.user.id},evaluationId,input.jobId,request.headers.get("Idempotency-Key")??"");
});
