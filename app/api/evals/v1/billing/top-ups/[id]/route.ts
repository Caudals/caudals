import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { cancelTopUp, idempotencyKey, topUpStatus } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

const orderId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));

// Owner: the order's live status for the return page (spec §6.12).
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return topUpStatus(identity, orgId, orderId(request));
});

// Owner: {action: "cancel"} after leaving Checkout. Idempotency-Key required.
export const POST = api(async (request, identity) => {
  idempotencyKey(request);
  const body = z.strictObject({ orgId: z.uuid(), action: z.literal("cancel") }).parse(await jsonBody(request, 1024));
  return cancelTopUp(identity, body.orgId, orderId(request));
});
