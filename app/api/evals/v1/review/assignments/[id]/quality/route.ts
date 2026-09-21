import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { requireExpertProfile } from "@/lib/evals/domain/expert-identity";
import { recordQualityDecision } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
export const POST = api(async (request, identity) => {
  requireStageEEnabled();
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const input = z.strictObject({ decision: z.enum(["approve", "changes_requested", "reject"]), rationale: z.string().trim().min(1).max(12_000) }).parse(await jsonBody(request));
  return recordQualityDecision(await requireExpertProfile(identity.user.id), id, input);
});
