import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { writeProviderKey } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Write-only provider API keys; rotation appends a version (spec §5.5, §14.1).
export const POST = api(async (request, identity: EvalIdentity) => {
  const { orgId, ...key } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request, 16384));
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return writeProviderKey(identity, orgId, key);
});
