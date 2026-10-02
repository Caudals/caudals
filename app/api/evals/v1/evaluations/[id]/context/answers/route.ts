import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { answerGenerationQuestions } from "@/lib/evals/repositories/automatic-generation";

export const runtime = "nodejs";
// Answer or skip (blank answer) a generation's open context questions together.
export const POST = api(async (request, identity) => {
  const input = z.strictObject({
    orgId: z.uuid(),
    jobId: z.uuid(),
    answers: z.array(z.strictObject({ questionId: z.uuid(), answer: z.string().max(2000).nullable() })).min(1).max(50),
  }).parse(await jsonBody(request));
  const evaluationId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-3));
  await requireWorkspace(identity, input.orgId, "write");
  return answerGenerationQuestions({ orgId: input.orgId, actorId: identity.user.id }, evaluationId, input.jobId, input.answers);
});
