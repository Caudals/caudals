import { api, jsonBody } from "@/lib/evals/domain/http";
import { approveForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): a second admin (never the requester)
// approves the payload they reviewed ({orgId, payloadSha256}); the action runs as them. Audited.
export const POST = api(async (request, identity) => {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  return approveForAdmin(request, identity, id, await jsonBody(request, 4096));
});
