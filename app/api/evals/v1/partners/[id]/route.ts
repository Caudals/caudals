import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { emailAppUrl } from "@/lib/email/links";
import { stripeMode } from "@/lib/billing/payments-config";
import { partnerOverview, updatePartner } from "@/lib/evals/partners/repository";
import { getMarketingSiteOrigin } from "@/lib/seo";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));

/** The partner dashboard's data: clients and activity, referral codes, referred revenue (null until paid), allowance. */
export const GET = api(async (request, identity) => {
  const mode = new URL(request.url).searchParams.get("mode");
  const livemode = mode === "live" ? true : mode === "test" ? false : stripeMode() === "live";
  return partnerOverview(identity, partnerId(request), { livemode, marketingOrigin: getMarketingSiteOrigin(), appOrigin: emailAppUrl() });
});

/** Platform admins: status (active, suspended, closed), revenue share, note or client cap, with a reason. */
export const PATCH = api(async (request, identity) => updatePartner(identity, partnerId(request), await jsonBody(request, 8192)));
