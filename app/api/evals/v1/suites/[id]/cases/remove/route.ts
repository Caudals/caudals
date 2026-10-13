import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { removeSuiteDraftCases } from "@/lib/evals/repositories/evidence";

export const runtime = "nodejs";
// Bulk reject in the test-set review (launch L-22): remove several questions from an editable draft at once.
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), caseRevisionIds: z.array(z.uuid()).min(1).max(1000) }).parse(await jsonBody(request));
  const suiteId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-3));
  await requireWorkspace(identity, input.orgId, "write");
  return removeSuiteDraftCases({ orgId: input.orgId, actorId: identity.user.id }, suiteId, input.caseRevisionIds);
});
