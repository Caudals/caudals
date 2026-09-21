import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getOfflineBundle } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity,orgId,"write");
  const bundle=await getOfflineBundle({orgId,actorId:identity.user.id},id);
  return new Response(`${JSON.stringify(bundle)}\n`,{headers:{"Content-Type":"application/json; charset=utf-8",
    "Content-Disposition":`attachment; filename="caudals-runner-${id}.json"`}});
});
