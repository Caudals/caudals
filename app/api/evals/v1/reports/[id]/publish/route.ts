import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { publishReport } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const {orgId,revisionId}=z.strictObject({orgId:z.uuid(),revisionId:z.uuid()}).parse(await jsonBody(request)),id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,orgId,"write");return publishReport({orgId,actorId:identity.user.id},id,revisionId);});
