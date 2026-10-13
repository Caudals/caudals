import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { billingSummary } from "@/lib/billing/customer-api";

export const runtime = "nodejs";

// Owners and editors (launch L-15, spec §6.12): balance, plan, usage this
// month against the cap, alerts and the next expiry; auto-recharge, the saved
// card and payments for owners. 404 for viewers and wherever billing does not
// show (BILLING_UI_ENABLED and the workspace's eligibility).
export const GET = api(async (request, identity) => billingSummary(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));
