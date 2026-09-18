import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { candidateSuite } from "@/lib/evals/repositories/managed";
import { candidateAnswerTemplate } from "@/lib/evals/imports/structured";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-2)),format=z.enum(["csv","jsonl"]).default("csv").parse(url.searchParams.get("format")??"csv");await requireWorkspace(identity,orgId,"write");const data=await candidateSuite({orgId,actorId:identity.user.id},id),body=candidateAnswerTemplate(data,format);return new Response(body,{headers:{"Content-Type":format==="csv"?"text/csv; charset=utf-8":"application/x-ndjson","Content-Disposition":`attachment; filename="candidate-answers-${id}.${format}"`}});});
