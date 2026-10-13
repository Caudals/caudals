import { api } from "@/lib/evals/domain/http";
import { listApprovalsForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin (L-16): two-person approval requests (?status=open|pending|approved|executed|rejected|cancelled|expired).
export const GET = api(async (request, identity) => listApprovalsForAdmin(identity, new URL(request.url).searchParams));
