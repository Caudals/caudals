import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { getDatasetArtifact } from "@/lib/evals/improvements/store";

export const runtime = "nodejs";
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); if (!identity.platformRole) throw new EvalError("SCOPE_DENIED", 404);
  const url = new URL(request.url); const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  const artifactId = z.uuid().parse(url.pathname.split("/").at(-1));
  const artifact = await getDatasetArtifact({ orgId, actorId: identity.user.id }, artifactId);
  return new Response(new Uint8Array(artifact.bytes), { headers: {
    "Content-Type": artifact.mediaType,
    "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
    "Content-Length": String(artifact.bytes.byteLength),
    "Digest": `sha-256=${Buffer.from(artifact.sha256, "hex").toString("base64")}`,
  } });
});
