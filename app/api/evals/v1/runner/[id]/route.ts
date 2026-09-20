import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { revokeRunner } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export const DELETE=api(async(request,identity)=>{
  const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-1));
  await requireWorkspace(identity,orgId,"manage");
  return revokeRunner({orgId,actorId:identity.user.id},id);
});
