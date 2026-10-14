import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { grantPartnerAllowance, setPartnerAllowance } from "@/lib/evals/partners/repository";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/** Platform admins set the agreement's allowance `{monthlyCredits, validFrom, validUntil?, reason}`. */
export const PUT = api(async (request, identity) => setPartnerAllowance(identity, partnerId(request), await jsonBody(request, 4096)));
/**
 * Platform admins grant `{orgId, credits, reason, expiresAt?}` from this
 * month's allowance into one of the partner's clients (Idempotency-Key): a
 * billing.grant in that workspace's ledger, never more than the month allows.
 */
export const POST = api(async (request, identity) =>
  grantPartnerAllowance(identity, partnerId(request), await jsonBody(request, 4096), request.headers.get("idempotency-key")));
