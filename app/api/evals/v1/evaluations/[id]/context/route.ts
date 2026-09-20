import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { getPreparation,prepareContext } from "@/lib/evals/repositories/managed";
import { customerPreparationView } from "@/lib/evals/domain/preparation-view";

export const runtime="nodejs";
const source=z.strictObject({revisionId:z.uuid(),authority:z.string().min(1).max(200).optional(),applicableFrom:z.iso.datetime().nullable().optional(),applicableTo:z.iso.datetime().nullable().optional(),claims:z.record(z.string(),z.string().max(2000)).optional()});
function evaluationId(request:Request){return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));}
export const GET=api(async(request,identity)=>{const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));await requireWorkspace(identity,orgId,"read");const state=await getPreparation({orgId,actorId:identity.user.id},evaluationId(request));return customerPreparationView(state);});
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),purpose:z.string().max(2000).optional(),intendedUsers:z.array(z.string().max(500)).max(50).optional(),tasks:z.array(z.string().max(500)).max(100).optional(),languages:z.array(z.string().min(2).max(35)).max(20).optional(),jurisdiction:z.string().max(200).optional(),asOf:z.iso.datetime().nullable().optional(),sources:z.array(source).min(1).max(100),capabilities:z.array(z.string().max(200)).max(50).optional(),risks:z.array(z.string().max(500)).max(100).optional(),allowedActions:z.array(z.string().max(500)).max(100).optional(),tools:z.array(z.string().max(500)).max(100).optional(),promptRevision:z.string().min(1).max(200),modelRevisionId:z.uuid().nullable().optional()}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"write");const {orgId,...context}=input;return prepareContext({orgId,actorId:identity.user.id},evaluationId(request),context,request.headers.get("Idempotency-Key")??"");});
