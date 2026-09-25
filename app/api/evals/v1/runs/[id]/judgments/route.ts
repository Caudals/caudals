import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { advanceJudgments, listRunJudgments } from "@/lib/evals/repositories/judging";
export const runtime = "nodejs";

// Rubric-judge status and advancement for one run. Judge prompts and raw model
// output are never returned; results appear as ordinary superseding assessments.
function runId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}

export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "write");
  return listRunJudgments({ orgId, actorId: identity.user.id }, runId(request));
});

export const POST = api(async (request, identity) => {
  const { orgId } = z.strictObject({ orgId: z.uuid() }).parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "write");
  return advanceJudgments({ orgId, actorId: identity.user.id }, runId(request));
});
