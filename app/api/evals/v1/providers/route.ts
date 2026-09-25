import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { listProviders, registerModelRevision } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Operator-only provider registry (spec §13.3 /providers, §14.1). Never returns endpoints or keys.
function platform(identity: EvalIdentity) { if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404); }

export const GET = api(async (request, identity) => {
  platform(identity);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return listProviders({ orgId, actorId: identity.user.id });
});

export const POST = api(async (request, identity) => {
  const { orgId, revision } = z.strictObject({ orgId: z.uuid(), revision: z.record(z.string(), z.unknown()) }).parse(await jsonBody(request));
  return registerModelRevision(identity, orgId, revision);
});
