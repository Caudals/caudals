import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { createWebsiteSource } from "@/lib/evals/repositories/evidence";
import { validatePublicDestination } from "@/lib/evals/connectors/egress";
import { EvalError } from "@/lib/evals/domain/errors";

export const runtime="nodejs";
export const POST=api(async(request,identity)=>{
 // Resolve the form's omitted limit before hashing the idempotency payload:
 // canonical JSON rejects undefined values.
 const input=z.strictObject({orgId:z.uuid(),evaluationId:z.uuid(),projectId:z.uuid(),url:z.string().url().max(2048),title:z.string().min(1).max(200).optional(),rights:z.enum(["customer_owned","licensed","public_domain"]).default("customer_owned"),pageLimit:z.number().int().min(1).max(25).default(25)}).parse(await jsonBody(request));
 await requireWorkspace(identity,input.orgId,"write");
 let destination;
 try{destination=await validatePublicDestination(input.url);}
 catch{throw new EvalError("DESTINATION_INVALID",422,"Use a public HTTPS website URL without credentials, query parameters or fragments.");}
 if(destination.url.port)throw new EvalError("DESTINATION_INVALID",422,"Use the website's standard HTTPS address.");
 const title=input.title??destination.url.hostname;
 return createWebsiteSource({orgId:input.orgId,actorId:identity.user.id},{evaluationId:input.evaluationId,projectId:input.projectId,url:destination.url.href,title,rights:input.rights,pageLimit:input.pageLimit},request.headers.get("Idempotency-Key")??"");
});
