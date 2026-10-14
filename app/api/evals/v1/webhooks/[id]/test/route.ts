import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { testWebhookEndpoint } from "@/lib/evals/monitoring/webhooks";
import { resendSender } from "@/lib/evals/operations/notifications";
export const runtime="nodejs";
/**
 * "Send test" for a Slack, Teams or email destination (launch L-19, P-28):
 * an example alert, labelled as one, sent now; the result is stored on the
 * destination. Owners and operators; five a destination per hour; audited.
 */
export const POST=api(async(request,identity)=>{
  const body=await jsonBody(request),orgId=z.uuid().parse((body as {orgId?:unknown})?.orgId),
    id=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity,orgId,"manage");
  return testWebhookEndpoint({orgId,actorId:identity.user.id},id,{send:await resendSender().catch(()=>null)});
});
