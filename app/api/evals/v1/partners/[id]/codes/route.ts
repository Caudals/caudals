import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { emailAppUrl } from "@/lib/email/links";
import { createReferralCode, revokeReferralCode } from "@/lib/evals/partners/repository";
import { getMarketingSiteOrigin } from "@/lib/seo";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/** Partner admins: a new referral code `{label?}` with its demo and sign-up links (Idempotency-Key). */
export const POST = api(async (request, identity) =>
  createReferralCode(identity, partnerId(request), await jsonBody(request, 2048), request.headers.get("idempotency-key"), { marketing: getMarketingSiteOrigin(), app: emailAppUrl() }));
/** Partner admins revoke a code `{codeId, reason}`: new visits stop counting; earlier referrals stay. */
export const DELETE = api(async (request, identity) => revokeReferralCode(identity, partnerId(request), await jsonBody(request, 4096)));
