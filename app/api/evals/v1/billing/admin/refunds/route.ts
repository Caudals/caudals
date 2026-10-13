import { api, jsonBody } from "@/lib/evals/domain/http";
import { moneyRefundForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key: refunds an untouched purchase within 14 days
// (D-10). Ledger refund first, then the Stripe refund; audited. Above €100 net it opens a
// two-person approval request (L-16) that a second admin approves at /admin/approvals/:id/approve.
export const POST = api(async (request, identity) => moneyRefundForAdmin(request, identity, await jsonBody(request, 4096)));
