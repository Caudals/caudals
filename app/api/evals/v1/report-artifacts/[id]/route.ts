import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getReportArtifact } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-1));await requireWorkspace(identity,orgId,"read");const artifact=await getReportArtifact({orgId,actorId:identity.user.id},id);return new Response(new Uint8Array(artifact.bytes),{headers:{"Content-Type":artifact.media_type,"Content-Disposition":`attachment; filename="${id}"`,"Content-Length":String(artifact.bytes.length),"X-Content-Type-Options":"nosniff"}});});
