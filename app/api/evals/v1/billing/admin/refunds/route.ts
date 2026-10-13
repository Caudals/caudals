import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { RefundError, refundTopUp } from "@/lib/billing/refunds";
import { getStripe } from "@/lib/billing/stripe";
import { idempotencyKey, orderView, paymentApiError } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Platform admin, recent sign-in: refunds an untouched purchase within 14 days
// (D-10). Ledger refund first, then the Stripe refund; audited. Above €100 net
// a second approver is required (L-16).
export const POST = api(async (request, identity) => {
  requireRecentAuthentication(identity);
  const key = idempotencyKey(request);
  const body = z.strictObject({ orgId: z.uuid(), orderId: z.uuid(), reason: z.string().trim().min(3).max(2000) }).parse(await jsonBody(request, 4096));
  const scope = { orgId: body.orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  try {
    const order = await refundTopUp({ ...body, actorId: identity.user.id, requestId }, getStripe());
    await withTenant(scope, db => idempotent(db, scope, "billing-admin-refunds", key, body, async () => ({ orderId: order.id, status: order.status })));
    return orderView(order);
  } catch (error) {
    if (error instanceof RefundError) {
      throw error.code === "SECOND_APPROVER_REQUIRED"
        ? new EvalError(error.code, 409, "Refunds above €100 need a second administrator's approval.")
        : new EvalError(error.code, 503, "The credits were removed but Stripe has not confirmed the refund yet. Try again in a few minutes.");
    }
    return paymentApiError(error);
  }
});
