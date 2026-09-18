import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { getRun } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),id=z.uuid().parse(url.pathname.split("/").at(-1));await requireWorkspace(identity,orgId,"read");return getRun({orgId,actorId:identity.user.id},id);});
