import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { queueConnectionCheck } from "@/lib/evals/repositories/managed";
import { getTargetConnectionKind,queueWebsiteConnectionCheck } from "@/lib/evals/repositories/stage-c";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{const {orgId}=z.strictObject({orgId:z.uuid()}).parse(await jsonBody(request));const id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));await requireWorkspace(identity,orgId,"write");const scope={orgId,actorId:identity.user.id};return (await getTargetConnectionKind(scope,id))==="website"?queueWebsiteConnectionCheck(scope,id,request.headers.get("idempotency-key")??""):queueConnectionCheck(scope,id,request.headers.get("idempotency-key")??"");});
