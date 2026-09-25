import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { registerModelPrice } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Immutable price revisions (spec §14.1, §14.3): prices are currency per token.
export const POST = api(async (request, identity: EvalIdentity) => {
  const { orgId, price } = z.strictObject({ orgId: z.uuid(), price: z.record(z.string(), z.unknown()) }).parse(await jsonBody(request));
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return registerModelPrice(identity, orgId, price);
});
