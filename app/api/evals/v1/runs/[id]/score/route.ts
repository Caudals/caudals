import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { scoreRun } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const {orgId,graderRevisionId}=z.strictObject({orgId:z.uuid(),graderRevisionId:z.string().min(1).max(200)}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,orgId,"write");return scoreRun({orgId,actorId:identity.user.id},id,graderRevisionId);});
