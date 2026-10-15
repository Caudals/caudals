import { api, jsonBody } from "@/lib/evals/domain/http";
import { acknowledgePriceCheckForAdmin } from "@/lib/billing/price-check-ack";
export const runtime = "nodejs";

/** A platform admin acknowledges the latest provider-price check's findings (launch G2, spec §6.4). */
export const POST = api(async (request, identity) =>
  acknowledgePriceCheckForAdmin(request, identity, new URL(request.url).pathname.split("/").at(-2) ?? "", await jsonBody(request)));
