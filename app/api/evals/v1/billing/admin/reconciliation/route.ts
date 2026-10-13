import { api, jsonBody } from "@/lib/evals/domain/http";
import { reconciliationForAdmin, runReconciliationForAdmin } from "@/lib/billing/ops-reports";

export const runtime = "nodejs";

// Platform admin (L-16): the daily reconciliation — stored reports (?date=&mode=) and the clean-day
// streak; POST {date?} reconciles a UTC day now (recent sign-in, Idempotency-Key).
export const GET = api(async (request, identity) => reconciliationForAdmin(identity, new URL(request.url).searchParams));
export const POST = api(async (request, identity) => runReconciliationForAdmin(request, identity, await jsonBody(request, 1024)));
