import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { EvalError } from "@/lib/evals/domain/errors";
import { listGateThresholds } from "@/lib/evals/monitoring/ci-runs";
import { integrationsV2Enabled } from "@/lib/evals/monitoring/integrations-flag";
export const runtime="nodejs";
/** Approved test sets and their release-gate thresholds (launch L-19, Settings → Developers). */
export const GET=api(async(request,identity)=>{
  if(!integrationsV2Enabled())throw new EvalError("SCOPE_DENIED",404);
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"read");
  return listGateThresholds({orgId,actorId:identity.user.id});
});
