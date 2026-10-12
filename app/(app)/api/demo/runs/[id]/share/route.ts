import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { failure, json, sameOrigin, tokenFor, UUID } from "@/lib/demo/http";
import { sha256, clientHash } from "@/lib/demo/client";
import { getRun } from "@/lib/demo/store";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{id:string}> }) {
  if (!sameOrigin(request)) return failure("forbidden",403);
  const limit = await consumeRateLimit({key:`demo-share:${clientHash(request.headers)}`,limit:30,windowMs:3600_000});
  if (!limit.allowed) return failure("rate_limited",429);
  const {id}=await context.params, token=UUID.test(id)?tokenFor(request,id):null;
  const run=token?await getRun(id,sha256(token)):null;
  if (!run || run.phase!=="done") return failure("not_found",404);
  await recordProductEvent({eventName:"demo_report_shared",source:"server",runId:id,eventKey:id,attribution:run.attribution});
  return json({ok:true});
}
