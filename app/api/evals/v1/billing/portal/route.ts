import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { idempotencyKey, openBillingPortal } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Owner: a Stripe Customer Portal session to manage saved cards. Card data
// stays on Stripe's pages. Idempotency-Key required.
export const POST = api(async (request, identity) => {
  idempotencyKey(request);
  const body = z.strictObject({ orgId: z.uuid(), locale: z.enum(["en", "es"]).default("en") }).parse(await jsonBody(request, 1024));
  return openBillingPortal(identity, body.orgId, body.locale);
});
