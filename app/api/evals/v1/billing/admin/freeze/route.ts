import { api, jsonBody } from "@/lib/evals/domain/http";
import { freezeForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): freeze or unfreeze a credit account
// (fraud, chargeback). Unfreezing is refused while a payment dispute is open. Audited.
export const POST = api(async (request, identity) => freezeForAdmin(request, identity, await jsonBody(request, 4096)));
