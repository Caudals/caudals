import { api, jsonBody } from "@/lib/evals/domain/http";
import { closeApprovalForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): the requester cancels a pending request,
// another admin rejects it ({orgId, reason}). Audited.
export const POST = api(async (request, identity) => {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  return closeApprovalForAdmin(request, identity, id, await jsonBody(request, 4096));
});
