import { api } from "@/lib/evals/domain/http";
import { searchAccountsForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin (L-16): credit accounts by workspace name or id, owner email or domain, order or Stripe id.
export const GET = api(async (request, identity) => searchAccountsForAdmin(identity, new URL(request.url).searchParams));
