import { api } from "@/lib/evals/domain/http";
import { billingUsage } from "@/lib/billing/customer-api";

export const runtime = "nodejs";

// Owners and editors (launch L-15, spec §6.12, §6.16): usage by day, by
// evaluation and run, by model and meter (?from=&to= UTC dates, default this
// month), or every ledger debit as CSV (?format=csv). Derived from the ledger.
export const GET = api(async (request, identity) => billingUsage(identity, new URL(request.url).searchParams));
