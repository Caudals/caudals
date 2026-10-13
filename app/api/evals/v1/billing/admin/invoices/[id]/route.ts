import { api, jsonBody } from "@/lib/evals/domain/http";
import { adminInvoiceAction, adminInvoiceInput } from "@/lib/billing/invoicing/api";

export const runtime = "nodejs";

// Platform admin, recent sign-in, Idempotency-Key (L-13): {action: "issue"} attaches the
// number, issue date and PDF the accountant issued; {action: "void"} voids a Stripe
// test-mode document. Audited in the database; the billing contact is emailed once.
export const POST = api(async (request, identity) => {
  const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
  const body = adminInvoiceInput.parse(await jsonBody(request, 8 * 1024 * 1024));
  return adminInvoiceAction(request, identity, id, body);
});
