import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { answerContext } from "@/lib/evals/repositories/managed";

export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),answer:z.unknown()}).parse(await jsonBody(request)),parts=new URL(request.url).pathname.split("/"),evaluationId=z.uuid().parse(parts.at(-4)),questionId=z.uuid().parse(parts.at(-1));await requireWorkspace(identity,input.orgId,"write");return answerContext({orgId:input.orgId,actorId:identity.user.id},evaluationId,questionId,input.answer);});
