import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { listTargetCredentials, storeTargetCredential } from "@/lib/evals/repositories/credentials";
export const runtime = "nodejs";

// Write-only credential entry for a connected system. The response never
// contains the secret; rotation appends a version and a new target revision.
const inputSchema = z.strictObject({
  orgId: z.uuid(),
  recordId: z.uuid().optional(),
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["bearer", "header_token"]),
  headerName: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/).default("Authorization"),
  value: z.string().min(1).max(8192),
  expiresAt: z.iso.datetime().nullable().optional(),
});

function targetId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return listTargetCredentials({ orgId, actorId: identity.user.id }, targetId(request));
});

export const POST = api(async (request, identity) => {
  const input = inputSchema.parse(await jsonBody(request, 16384));
  await requireWorkspace(identity, input.orgId, "write");
  return storeTargetCredential({ orgId: input.orgId, actorId: identity.user.id }, targetId(request), input);
});
