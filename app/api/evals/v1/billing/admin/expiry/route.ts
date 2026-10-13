import { api, jsonBody } from "@/lib/evals/domain/http";
import { extendExpiryForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): move a credit lot's expiry later. Audited.
export const POST = api(async (request, identity) => extendExpiryForAdmin(request, identity, await jsonBody(request, 4096)));
