import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { EvalError } from "@/lib/evals/domain/errors";
import { queueConnectionCheck } from "@/lib/evals/repositories/managed";
import { CONNECTION_CHECK_LIMITS,connectionCheckState,queueWebsiteConnectionCheck } from "@/lib/evals/repositories/stage-c";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const runtime="nodejs";
/**
 * Check a system's connection ("Check now", launch L-22). The probe is the
 * existing bounded one: an API answers one harmless request; a website chat
 * replays its saved recipe through the browser worker within its timeout.
 * Editors and owners only; one check per system version at a time (a second
 * request returns the one in flight); at most 5 per system in 10 minutes and
 * 30 per workspace an hour.
 */
export const POST=api(async(request,identity)=>{
  const {orgId}=z.strictObject({orgId:z.uuid()}).parse(await jsonBody(request));
  const id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity,orgId,"write");
  const scope={orgId,actorId:identity.user.id};
  const state=await connectionCheckState(scope,id);
  if(state.inFlight)return {id:state.inFlight.id,status:state.inFlight.status,reused:true};
  const limits=[
    {key:`connection-check:system:${orgId}:${id}`,...CONNECTION_CHECK_LIMITS.perSystem},
    {key:`connection-check:workspace:${orgId}`,...CONNECTION_CHECK_LIMITS.perWorkspace},
  ];
  for(const limit of limits){
    const result=await consumeRateLimit(limit);
    if(!result.allowed)throw new EvalError("RATE_LIMITED",429,`Too many connection checks. Try again in ${Math.max(1,Math.ceil(result.retryAfterSeconds/60))} min.`);
  }
  const key=request.headers.get("idempotency-key")??"";
  return state.kind==="website"?queueWebsiteConnectionCheck(scope,id,key):queueConnectionCheck(scope,id,key);
});
