import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { createPartnerClient, linkPartnerClient, unlinkPartnerClient } from "@/lib/evals/partners/repository";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/**
 * `{name}`: a partner admin creates a client workspace the partner manages
 * (Idempotency-Key). `{orgId, access, reason}`: a platform admin links an
 * existing workspace (the client's agreement is the reason).
 */
export const POST = api(async (request, identity) => {
  const body = await jsonBody(request, 4096);
  return body && typeof body === "object" && "orgId" in body
    ? linkPartnerClient(identity, partnerId(request), body)
    : createPartnerClient(identity, partnerId(request), body, request.headers.get("idempotency-key"));
});
/** Platform admins end a link `{orgId, reason}`; the partner's people lose access in the same transaction. */
export const DELETE = api(async (request, identity) => unlinkPartnerClient(identity, partnerId(request), await jsonBody(request, 4096)));
