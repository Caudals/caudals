import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getReportArtifact } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
/** A readable file name with the right extension; built only from the artifact ID. */
function downloadName(id:string,mediaType:string){const ext=mediaType==="application/pdf"?"pdf":mediaType.startsWith("text/csv")?"csv":mediaType.includes("jsonl")||mediaType.includes("ndjson")?"jsonl":mediaType==="application/json"?"json":"bin";return `caudals-report-${id.slice(0,8)}.${ext}`;}
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-1));await requireWorkspace(identity,orgId,"read");const artifact=await getReportArtifact({orgId,actorId:identity.user.id},id);return new Response(new Uint8Array(artifact.bytes),{headers:{"Content-Type":artifact.media_type,"Content-Disposition":`attachment; filename="${downloadName(id,artifact.media_type)}"`,"Content-Length":String(artifact.bytes.length),"X-Content-Type-Options":"nosniff"}});});
