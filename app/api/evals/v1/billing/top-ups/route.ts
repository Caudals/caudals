import { randomUUID } from "node:crypto";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { startTopUp, topUpInput } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Owner: buys a pack. Creates the order, records Terms and Privacy acceptance
// (context checkout) and returns the Stripe Checkout URL. Idempotency-Key required.
export const POST = api(async (request, identity) => {
  const body = topUpInput.parse(await jsonBody(request, 4096));
  return startTopUp(request, identity, body, randomUUID());
});
