import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { approvePreparedSuite } from "@/lib/evals/repositories/stage-c";

export const runtime = "nodejs";
/** How the test set was reviewed (launch L-22): a spot check is allowed on free and pay-as-you-go workspaces only. */
const reviewSchema = z.strictObject({
  mode: z.enum(["spot_check", "full"]),
  checkedCaseRevisionIds: z.array(z.uuid()).max(1000).default([]),
  approvedCaseRevisionIds: z.array(z.uuid()).max(1000).default([]),
});
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), suiteVersionId: z.uuid(), review: reviewSchema.optional() }).parse(await jsonBody(request));
  const evaluationId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  return approvePreparedSuite(
    { orgId: input.orgId, actorId: identity.user.id },
    evaluationId,
    input.suiteVersionId,
    request.headers.get("idempotency-key") ?? "",
    input.review,
  );
});
