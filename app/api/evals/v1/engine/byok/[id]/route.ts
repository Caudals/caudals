import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { revokeByokKey, rotateByokKey } from "@/lib/evals/repositories/byok";
export const runtime = "nodejs";

const keyId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));

// Replace a workspace key (checked first, recent sign-in) or remove it (launch L-27).
export const PATCH = api(async (request, identity) => {
  const { orgId, ...input } = z.object({ orgId: z.uuid() }).passthrough().parse(await jsonBody(request, 4096));
  return rotateByokKey(identity, orgId, keyId(request), input);
});

export const DELETE = api(async (request, identity) =>
  revokeByokKey(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId")), keyId(request)));
