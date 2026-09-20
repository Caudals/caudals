import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createPairing } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export const POST=api(async(request,identity)=>{
  const {orgId,targetId}=z.strictObject({orgId:z.uuid(),targetId:z.uuid()}).parse(await jsonBody(request));
  await requireWorkspace(identity,orgId,"write");
  return createPairing({orgId,actorId:identity.user.id},targetId);
});
