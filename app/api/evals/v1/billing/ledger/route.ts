import { api } from "@/lib/evals/domain/http";
import { billingLedger } from "@/lib/billing/customer-api";

export const runtime = "nodejs";

// Owners (launch L-15, spec §6.16): the workspace's ledger entries, newest
// first, paginated with ?cursor=. Holds and releases only with ?holds=1.
export const GET = api(async (request, identity) => billingLedger(identity, new URL(request.url).searchParams));
