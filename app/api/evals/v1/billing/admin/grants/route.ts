import { api, jsonBody } from "@/lib/evals/domain/http";
import { creditActionForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): grant credits with a reason, expiry and
// campaign tag. Above 10,000 credits it opens a two-person approval request instead. Audited.
export const POST = api(async (request, identity) => creditActionForAdmin(request, identity, "grant", await jsonBody(request, 8192)));
