import { api } from "@/lib/evals/domain/http";
import { billingRates } from "@/lib/billing/customer-api";

export const runtime = "nodejs";

// Owners and editors where billing shows (launch L-15): the credit rates of
// the models an evaluation's runs use, and the price list (spec §6.3, §6.4).
export const GET = api(async (request, identity) => billingRates(identity, new URL(request.url).searchParams));
