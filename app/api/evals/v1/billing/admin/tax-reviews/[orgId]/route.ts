import { api, jsonBody } from "@/lib/evals/domain/http";
import { resolveTaxReviewForAdmin } from "@/lib/billing/tax-review";

export const runtime = "nodejs";

// Platform admin with a recent sign-in (launch G2, spec §6.14): sets the tax treatment after the review. Audited.
export const POST = api(async (request, identity) =>
  resolveTaxReviewForAdmin(request, identity, new URL(request.url).pathname.split("/").at(-1) ?? "", await jsonBody(request)));
