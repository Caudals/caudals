import { api } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { requireExpertProfile } from "@/lib/evals/domain/expert-identity";
import { listAssignedWork } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
export const GET = api(async (_request, identity) => {
  requireStageEEnabled();
  return listAssignedWork(await requireExpertProfile(identity.user.id));
});
