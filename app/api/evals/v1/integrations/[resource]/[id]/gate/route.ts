import { z } from "zod";
import { authenticateCustomerToken, customerApiErrorResponse } from "@/lib/evals/monitoring/tokens";
import { integrationsV2Enabled } from "@/lib/evals/monitoring/integrations-flag";
import { runGate } from "@/lib/evals/monitoring/ci-runs";
import { EvalError } from "@/lib/evals/domain/errors";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
/**
 * Release gate (launch L-19, P-27): `GET /integrations/runs/{runId}/gate?orgId=…`
 * with a `runs:read` or `runs:write` token. `pass`, `fail` (below the threshold
 * set on the schedule or the test set), `unknown` (no result: failed,
 * cancelled, paused, too few graded answers, or no threshold) or `pending`.
 * Behind INTEGRATIONS_V2_ENABLED (404 when off).
 */
export async function GET(request:Request){
  try{
    const url=new URL(request.url),parts=url.pathname.split("/");
    if(parts.at(-1)!=="gate"||parts.at(-3)!=="runs"||!integrationsV2Enabled())throw new EvalError("SCOPE_DENIED",404);
    const orgId=z.uuid().parse(url.searchParams.get("orgId")),runId=z.uuid().parse(parts.at(-2));
    await authenticateCustomerToken(orgId,request.headers.get("authorization"),["runs:read","runs:write"]);
    const gate=await runGate(orgId,runId);
    return Response.json({data:gate},{headers:gate.status==="pending"?{...headers,"Retry-After":"30"}:headers});
  }catch(error){return customerApiErrorResponse(error,headers);}
}
