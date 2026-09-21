import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { requireExpertProfile } from "@/lib/evals/domain/expert-identity";
import { expertSubmissionDocumentSchema } from "@/lib/evals/experts/contracts";
import { readAssignedWork, saveExpertSubmission } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
const id = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-1));
export const GET = api(async (request, identity) => {
  requireStageEEnabled();
  return readAssignedWork(await requireExpertProfile(identity.user.id), id(request));
});
export const PATCH = api(async (request, identity) => {
  requireStageEEnabled();
  const input = z.strictObject({ expectedVersion: z.int().nonnegative(), document: expertSubmissionDocumentSchema, submit: z.boolean().optional() }).parse(await jsonBody(request, 100_000));
  return saveExpertSubmission(await requireExpertProfile(identity.user.id), id(request), input);
});
