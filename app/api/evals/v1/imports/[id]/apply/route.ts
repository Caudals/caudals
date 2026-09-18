import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { importMatchedAnswers } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const {orgId,runId}=z.strictObject({orgId:z.uuid(),runId:z.uuid()}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,orgId,"write");return importMatchedAnswers({orgId,actorId:identity.user.id},id,runId);});
