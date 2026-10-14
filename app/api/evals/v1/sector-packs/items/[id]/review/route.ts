import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { requirePackAuthorIdentity } from "@/lib/evals/sector-packs/http";
import { reviewPackItem } from "@/lib/evals/sector-packs/store";

export const runtime = "nodejs";

// An eligible expert records a review of one question (approve, request changes, reject).
export const POST = api(async (request, identity) => {
  const role = await requirePackAuthorIdentity(identity);
  if (!role.reviewer) throw new EvalError("SCOPE_DENIED", 403, "Only an eligible expert records a review.");
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const input = z.strictObject({ decision: z.enum(["approved", "changes_requested", "rejected"]), note: z.string().trim().max(2000).optional() }).parse(await jsonBody(request));
  return reviewPackItem(identity.user.id, id, input.decision, input.note ?? null);
});
