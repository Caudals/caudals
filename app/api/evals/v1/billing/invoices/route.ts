import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { listInvoices } from "@/lib/billing/invoicing/api";

export const runtime = "nodejs";

// Owner: the workspace's invoices and rectifying invoices (spec §6.16, L-13).
// 404 while invoicing is off (BILLING_INVOICING_PROVIDER).
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return listInvoices(identity, orgId);
});
