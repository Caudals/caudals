import { api, jsonBody } from "@/lib/evals/domain/http";
import { noticeActionForAdmin, noticeForAdmin } from "@/lib/billing/price-notice";

export const runtime = "nodejs";

// Platform admin (L-16): the increase notice of a price-book revision — what rises, the 30-day
// deadline and the recipients (GET ?orgId=); POST {orgId, action: "test"|"send"} (recent sign-in,
// Idempotency-Key): a test copy to the internal address, or the real notice while BILLING_PRICE_NOTICES=owners.
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  return noticeForAdmin(identity, url.pathname.split("/").at(-2) ?? "", url.searchParams);
});
export const POST = api(async (request, identity) => {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  return noticeActionForAdmin(request, identity, id, await jsonBody(request, 1024));
});
