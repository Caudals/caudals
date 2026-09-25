import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { amendBudget } from "@/lib/evals/repositories/platform";
export const runtime = "nodejs";

// Authorized, attributed cap changes (spec §13.3 POST /budgets/:id/amendments).
// `:id` is the workspace whose limits change; the body names the target.
export const POST = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  return amendBudget(identity, orgId, await jsonBody(request));
});
