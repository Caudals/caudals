import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { billingCaps, saveBillingCaps } from "@/lib/billing/customer-api";

export const runtime = "nodejs";

// Spend caps (launch L-15, spec §6.10, §6.16). GET: owners and editors (alert
// recipients for owners). PUT: owners, with an Idempotency-Key; audited.
export const GET = api(async (request, identity) => billingCaps(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));

export const PUT = api(async (request, identity) => saveBillingCaps(request, identity, await jsonBody(request, 2048)));
