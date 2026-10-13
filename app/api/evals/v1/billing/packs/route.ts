import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { billingOverview } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Owner: packs with the VAT preview for the billing profile, the first top-up
// bonus, purchase limits, auto-recharge settings and the saved card (spec §6.16).
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const locale = url.searchParams.get("locale") === "es" ? "es" : "en";
  return billingOverview(identity, orgId, locale);
});
