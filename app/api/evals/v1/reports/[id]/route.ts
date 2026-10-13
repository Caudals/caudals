import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getReport } from "@/lib/evals/repositories/managed";
import { aiDisclosureCheckEnabled,withoutDisclosure } from "@/lib/evals/scoring/disclosure";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-1));await requireWorkspace(identity,orgId,"read");const result=await getReport({orgId,actorId:identity.user.id},id);
 // L-29: the AI-disclosure check shows only while AI_DISCLOSURE_CHECK is on.
 return aiDisclosureCheckEnabled()?result:{...result,revisions:result.revisions.map((revision:{snapshot:unknown})=>({...revision,snapshot:withoutDisclosure(revision.snapshot)}))};});
