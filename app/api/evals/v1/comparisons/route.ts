import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { compareRuns } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),baselineRunId:z.uuid(),candidateRunId:z.uuid()}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"read");return compareRuns({orgId:input.orgId,actorId:identity.user.id},input.baselineRunId,input.candidateRunId);});
