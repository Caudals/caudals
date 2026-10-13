import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { planSummary } from "@/lib/billing/plan-summary";

export const runtime = "nodejs";

// Plans v2 (launch L-14): the workspace's plan, what counts against each
// limit and what credits or a managed plan unlock. 404 while plans v2 is off
// for the workspace (PLANS_V2_ENABLED or its admin override).
export const GET = api(async (request, identity) => planSummary(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));
