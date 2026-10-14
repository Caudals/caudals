import { api, jsonBody } from "@/lib/evals/domain/http";
import { createPartner, listPartners } from "@/lib/evals/partners/repository";

export const runtime = "nodejs";

/**
 * Partner accounts (launch L-28, PARTNERS_ENABLED). GET: the person's
 * partners (platform admins: all). POST: a platform admin creates a partner
 * (recent sign-in, Idempotency-Key, reason; audited). 404 while the flag is off.
 */
export const GET = api(async (_request, identity) => listPartners(identity));
export const POST = api(async (request, identity) => createPartner(identity, await jsonBody(request, 8192), request.headers.get("idempotency-key")));
