import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { getBrowserCapture } from "@/lib/evals/repositories/browser-sessions";
export const runtime = "nodejs";

// Seven-day, input-masked discovery screenshot for operator assistance.
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  const capture = await getBrowserCapture({ orgId, actorId: identity.user.id }, z.uuid().parse(url.pathname.split("/").at(-1)));
  return new Response(new Uint8Array(capture.bytes), { headers: { "Content-Type": capture.media_type, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" } });
});
