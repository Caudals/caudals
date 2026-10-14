import { z } from "zod";
import { api,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { EvalError } from "@/lib/evals/domain/errors";
import { saveSuiteGateThreshold } from "@/lib/evals/monitoring/ci-runs";
import { integrationsV2Enabled } from "@/lib/evals/monitoring/integrations-flag";
export const runtime="nodejs";
/** Sets or removes a test set's pass threshold: `{orgId, threshold: 0–100 | null}` (launch L-19). Owners and operators; audited. */
export const PUT=api(async(request,identity)=>{
  if(!integrationsV2Enabled())throw new EvalError("SCOPE_DENIED",404);
  const body=z.strictObject({orgId:z.uuid(),threshold:z.unknown()}).parse(await jsonBody(request)),
    suiteId=z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
  await requireWorkspace(identity,body.orgId,"manage");
  return saveSuiteGateThreshold({orgId:body.orgId,actorId:identity.user.id},suiteId,body.threshold??null);
});
