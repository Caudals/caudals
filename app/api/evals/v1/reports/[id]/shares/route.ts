import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createReportShare } from "@/lib/evals/repositories/managed";
import { listReportShares } from "@/lib/evals/repositories/operator-actions";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-2));await requireWorkspace(identity,orgId,"manage");return listReportShares({orgId,actorId:identity.user.id},id);});
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),reportRevisionId:z.uuid(),recipient:z.email().optional(),audience:z.enum(["workspace","named_recipient","bearer"]),expiresAt:z.iso.datetime(),permittedFields:z.array(z.enum(["system","scope","metrics","findings","results","improvements","methodology","takeaways"])).min(1)}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,input.orgId,"manage");return createReportShare({orgId:input.orgId,actorId:identity.user.id},id,input,request.headers.get("idempotency-key")??"");});
