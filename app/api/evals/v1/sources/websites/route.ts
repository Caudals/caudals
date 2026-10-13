import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { createWebsiteSource } from "@/lib/evals/repositories/evidence";
import { importWebsitePreview } from "@/lib/evals/repositories/intake";
import { intakeV2Enabled } from "@/lib/evals/intake/flags";
import { validatePublicDestination } from "@/lib/evals/connectors/egress";
import { EvalError } from "@/lib/evals/domain/errors";

export const runtime="nodejs";
// "Import help centre" (launch L-34, INTAKE_V2_ENABLED): the pages selected from a preview.
const imported=z.strictObject({orgId:z.uuid(),evaluationId:z.uuid(),projectId:z.uuid(),previewId:z.uuid(),selectedUrls:z.array(z.url().max(2048)).min(1).max(200),title:z.string().trim().min(1).max(200).optional()});
export const POST=api(async(request,identity)=>{
 const raw=await jsonBody(request);
 if(raw&&typeof raw==="object"&&!Array.isArray(raw)&&"previewId" in raw){
  if(!intakeV2Enabled())throw new EvalError("NOT_FOUND",404,"Not found.");
  const input=imported.parse(raw);
  await requireWorkspace(identity,input.orgId,"write");
  return importWebsitePreview({orgId:input.orgId,actorId:identity.user.id},{evaluationId:input.evaluationId,projectId:input.projectId,previewId:input.previewId,selectedUrls:input.selectedUrls,...(input.title?{title:input.title}:{})},request.headers.get("Idempotency-Key")??"");
 }
 // Resolve the form's omitted limit before hashing the idempotency payload:
 // canonical JSON rejects undefined values.
 const input=z.strictObject({orgId:z.uuid(),evaluationId:z.uuid(),projectId:z.uuid(),url:z.string().url().max(2048),title:z.string().min(1).max(200).optional(),rights:z.enum(["customer_owned","licensed","public_domain"]).default("customer_owned"),pageLimit:z.number().int().min(1).max(25).default(25)}).parse(raw);
 await requireWorkspace(identity,input.orgId,"write");
 let destination;
 try{destination=await validatePublicDestination(input.url);}
 catch{throw new EvalError("DESTINATION_INVALID",422,"Use a public HTTPS website URL without credentials, query parameters or fragments.");}
 if(destination.url.port)throw new EvalError("DESTINATION_INVALID",422,"Use the website's standard HTTPS address.");
 const title=input.title??destination.url.hostname;
 return createWebsiteSource({orgId:input.orgId,actorId:identity.user.id},{evaluationId:input.evaluationId,projectId:input.projectId,url:destination.url.href,title,rights:input.rights,pageLimit:input.pageLimit},request.headers.get("Idempotency-Key")??"");
});
