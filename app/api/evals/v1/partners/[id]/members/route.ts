import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { addPartnerMember, removePartnerMember } from "@/lib/evals/partners/repository";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/** Platform admins add a verified account to a partner as admin or member (or change its role), with a reason. */
export const POST = api(async (request, identity) => addPartnerMember(identity, partnerId(request), await jsonBody(request, 4096)));
/** Platform admins remove a person; their access to the partner's clients goes in the same transaction. */
export const DELETE = api(async (request, identity) => removePartnerMember(identity, partnerId(request), await jsonBody(request, 4096)));
