import { z } from "zod";
import { api, EvalError } from "@/lib/evals/domain/http";
import { auditLog } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Append-only audit metadata for one workspace (spec §13.3 /audit). No payloads.
export const GET = api(async (request, identity) => {
  if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const url = new URL(request.url);
  return auditLog({ orgId: z.uuid().parse(url.searchParams.get("orgId")), actorId: identity.user.id }, z.iso.datetime().optional().parse(url.searchParams.get("before") ?? undefined));
});
