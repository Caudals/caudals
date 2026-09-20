import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { prepareGroundedSuiteOnce } from "@/lib/evals/repositories/managed";

export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),sourceRevisionId:z.uuid(),title:z.string().min(1).max(200),executionMode:z.enum(["deployed_system","controlled_model","imported_responses"]),questions:z.array(z.strictObject({question:z.string().min(1).max(10000),expected:z.string().min(1).max(10000),anchor:z.string().min(1).max(200),severity:z.enum(["low","medium","high","critical"]).optional()})).min(1).max(500),promptRevision:z.string().min(1).max(200)}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,input.orgId,"write");const {orgId,...generation}=input;return prepareGroundedSuiteOnce({orgId,actorId:identity.user.id},id,generation,request.headers.get("Idempotency-Key")??"");});
