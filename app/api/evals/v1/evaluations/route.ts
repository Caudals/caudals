import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createEvaluation,listManaged } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));await requireWorkspace(identity,orgId,"read");return listManaged({orgId,actorId:identity.user.id});});
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),projectId:z.uuid(),title:z.string().min(1).max(200),evidencePolicy:z.enum(["exploratory","source_grounded"]),commercialCap:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,9})?$/),currency:z.string().regex(/^[A-Z]{3}$/)}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"write");return createEvaluation({orgId:input.orgId,actorId:identity.user.id},input,request.headers.get("idempotency-key")??"");});
