import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createMachineExport,queuePdfExport } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const input=z.strictObject({orgId:z.uuid(),reportRevisionId:z.uuid(),kind:z.enum(["pdf","csv","cef"])}).parse(await jsonBody(request));await requireWorkspace(identity,input.orgId,"read");const scope={orgId:input.orgId,actorId:identity.user.id};return input.kind==="pdf"?queuePdfExport(scope,input.reportRevisionId):createMachineExport(scope,input.reportRevisionId,input.kind);});
