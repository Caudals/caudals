import { api } from "@/lib/evals/domain/http";
import { fraudQueueForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin (L-16): the fraud queue — flagged sign-ups, top-up velocity, risk flags, disputes, frozen accounts.
export const GET = api(async (request, identity) => fraudQueueForAdmin(identity, new URL(request.url).searchParams));
