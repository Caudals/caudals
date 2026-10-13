import { api } from "@/lib/evals/domain/http";
import { accountForAdmin } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform admin (L-16): one workspace's billing — account, lots, holds, ledger timeline
// (?before=<account version>), orders, invoices, alerts, approvals and override. Audited support read.
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  return accountForAdmin(identity, url.pathname.split("/").at(-1) ?? "", url.searchParams);
});
