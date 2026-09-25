import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { listRoutes, setModelRoute } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Default model per internal role and workspace (spec §14.1 "set default roles").
export const GET = api(async (_request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  return listRoutes(identity);
});

export const POST = api(async (request, identity) => {
  const { orgId, route } = z.strictObject({ orgId: z.uuid(), route: z.record(z.string(), z.unknown()) }).parse(await jsonBody(request));
  return setModelRoute(identity, orgId, route);
});
