import { api, jsonBody } from "@/lib/evals/domain/http";
import { listOverridesForAdmin, setOverrideForAdmin } from "@/lib/billing/plan-summary";

export const runtime = "nodejs";

// Per-workspace billing overrides (launch L-14, decision I-11): credit
// enforcement, live-mode top-ups before Gate B and plans v2 before
// PLANS_V2_ENABLED. Platform admins only; a change needs a recent sign-in, an
// Idempotency-Key and a reason, and is audited in the database.
export const GET = api(async (_request, identity) => listOverridesForAdmin(identity));
export const PUT = api(async (request, identity) => setOverrideForAdmin(request, identity, await jsonBody(request, 8192)));
