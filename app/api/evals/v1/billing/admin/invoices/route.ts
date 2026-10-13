import { api } from "@/lib/evals/domain/http";
import { adminListInvoices } from "@/lib/billing/invoicing/api";

export const runtime = "nodejs";

// Platform admin: invoice documents across workspaces (?status=queued|pending_issue|issued|voided&mode=test|live), L-13.
export const GET = api(async (request, identity) => adminListInvoices(identity, new URL(request.url).searchParams));
