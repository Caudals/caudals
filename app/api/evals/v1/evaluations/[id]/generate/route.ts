import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { prepareGroundedSuiteOnce } from "@/lib/evals/repositories/managed";
import { locateManualQuestions } from "@/lib/evals/repositories/manual-questions";
import { getAutomaticGeneration, MAX_GENERATED_CASES, startAutomaticGeneration } from "@/lib/evals/repositories/automatic-generation";

export const runtime = "nodejs";
function evaluationId(request: Request) { return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2)); }
// Hand-written questions: each cites either a source anchor or a verbatim quote
// (optionally on a given page) that the server locates in the project's sources.
const manual = z.strictObject({
  orgId:z.uuid(), sourceRevisionId:z.uuid().optional(), title:z.string().min(1).max(200),
  executionMode:z.enum(["deployed_system","controlled_model","imported_responses"]),
  questions:z.array(z.strictObject({
    question:z.string().min(1).max(10000),expected:z.string().min(1).max(10000),
    anchor:z.string().min(1).max(200).optional(),sourceRevisionId:z.uuid().optional(),
    quote:z.string().trim().min(8).max(4000).optional(),url:z.url().max(2000).optional(),
    keyFacts:z.array(z.string().trim().min(1).max(1000)).min(1).max(12).optional(),
    title:z.string().trim().min(1).max(200).optional(),severity:z.enum(["low","medium","high","critical"]).optional(),
  }).refine(item=>!!item.anchor||!!item.quote,"Give each question an anchor or a quote.")).min(1).max(500),
  promptRevision:z.string().min(1).max(200),
});
const automatic = z.strictObject({
  mode:z.literal("automatic"), orgId:z.uuid(), sourceRevisionIds:z.array(z.uuid()).min(1).max(21),
  title:z.string().min(1).max(200), executionMode:z.enum(["deployed_system","controlled_model","imported_responses"]),
  promptRevision:z.string().min(1).max(100), maxCases:z.number().int().min(1).max(MAX_GENERATED_CASES).optional(),
  complexity:z.enum(["foundational","balanced","expert"]).optional(), locale:z.enum(["en","es"]).optional(),
});
export const GET=api(async(request,identity)=>{
 const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),jobId=url.searchParams.get("jobId")??undefined;
 await requireWorkspace(identity,orgId,"read");
 return getAutomaticGeneration({orgId,actorId:identity.user.id},evaluationId(request),jobId);
});
export const POST=api(async(request,identity)=>{
 const raw=await jsonBody(request),id=evaluationId(request);
 if(raw&&typeof raw==="object"&&!Array.isArray(raw)&&"mode" in raw&&raw.mode==="automatic"){
  const input=automatic.parse(raw);await requireWorkspace(identity,input.orgId,"write");
  const {mode:_mode,orgId,...generation}=input;
  return startAutomaticGeneration({orgId,actorId:identity.user.id},id,generation,request.headers.get("Idempotency-Key")??"");
 }
 const input=manual.parse(raw);await requireWorkspace(identity,input.orgId,"write");
 const {orgId,sourceRevisionId,questions,...generation}=input;
 const scope={orgId,actorId:identity.user.id};
 const located=await locateManualQuestions(scope,id,questions.map(item=>({...item,sourceRevisionId:item.sourceRevisionId??(item.anchor?sourceRevisionId:undefined)})));
 const sourceRevisionIds=[...new Set([...(sourceRevisionId?[sourceRevisionId]:[]),...located.sourceRevisionIds])];
 return prepareGroundedSuiteOnce(scope,id,{...generation,sourceRevisionIds,questions:located.questions.map(({quote:_quote,url:_url,...item})=>({...item,anchor:item.anchor!}))},request.headers.get("Idempotency-Key")??"");
});
