import { api, jsonBody } from "@/lib/evals/domain/http";
import { creditActionForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-16): refund credits — every charge of a run
// ({runId}) or one ledger entry reversed ({entryId}). Above 10,000 credits it needs a second admin.
export const POST = api(async (request, identity) => creditActionForAdmin(request, identity, "credit_refund", await jsonBody(request, 8192)));
