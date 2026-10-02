import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { regradeRun } from "@/lib/evals/repositories/managed";
export const runtime = "nodejs";

// Re-grade a finished run with the current grading engine. The system under
// test is not contacted again; results a person decided are kept.
export const POST = api(async (request, identity) => {
  const { orgId } = z.strictObject({ orgId: z.uuid() }).parse(await jsonBody(request));
  const runId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "write");
  return regradeRun({ orgId, actorId: identity.user.id }, runId);
});
