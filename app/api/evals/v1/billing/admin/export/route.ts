import { api } from "@/lib/evals/domain/http";
import { exportForAdmin } from "@/lib/billing/ops-reports";

export const runtime = "nodejs";

// Platform admin (L-16): the monthly accountant export (L-13) — ?month=YYYY-MM&mode=test|live
// [&stripe=1] for the summary, &file=<name> to download one file.
export const GET = api(async (request, identity) => exportForAdmin(identity, new URL(request.url).searchParams));
