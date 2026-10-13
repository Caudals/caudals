import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { invoicePdf } from "@/lib/billing/invoicing/api";

export const runtime = "nodejs";

// Owner: the PDF of an issued invoice or rectifying invoice (spec §6.16, L-13).
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const id = z.uuid().parse(url.pathname.split("/").at(-2));
  return invoicePdf(identity, orgId, id);
});
