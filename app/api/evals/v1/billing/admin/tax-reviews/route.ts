import { api } from "@/lib/evals/domain/http";
import { taxReviewsForAdmin } from "@/lib/billing/tax-review";

export const runtime = "nodejs";

// Platform admin (launch G2, spec §6.14): billing details waiting for a manual tax review, with the purchases refused meanwhile.
export const GET = api(async (_request, identity) => taxReviewsForAdmin(identity));
