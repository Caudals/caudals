import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getOfflineBundle } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity,orgId,"write");
  return getOfflineBundle({orgId,actorId:identity.user.id},id);
});
