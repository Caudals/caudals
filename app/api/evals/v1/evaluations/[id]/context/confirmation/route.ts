import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { decideContextConfirmation, getContextConfirmation } from "@/lib/evals/repositories/intake";
import { intakeV2Enabled } from "@/lib/evals/intake/flags";
import { EvalError } from "@/lib/evals/domain/errors";

export const runtime = "nodejs";
const evaluationId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-3));

// "What we understood about your assistant" (launch L-34, INTAKE_V2_ENABLED).
// Members read it; writers confirm it once (with corrections) or skip it.
export const GET = api(async (request, identity) => {
  if (!intakeV2Enabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const jobId = url.searchParams.get("jobId");
  await requireWorkspace(identity, orgId, "read");
  return getContextConfirmation({ orgId, actorId: identity.user.id }, evaluationId(request), jobId ? z.uuid().parse(jobId) : null);
});

export const POST = api(async (request, identity) => {
  if (!intakeV2Enabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const input = z.strictObject({
    orgId: z.uuid(), jobId: z.uuid(), decision: z.enum(["confirm", "skip"]),
    edits: z.record(z.string(), z.unknown()).optional(),
  }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "write");
  return decideContextConfirmation({ orgId: input.orgId, actorId: identity.user.id }, evaluationId(request), { jobId: input.jobId, decision: input.decision, ...(input.edits ? { edits: input.edits } : {}) }, request.headers.get("Idempotency-Key") ?? "");
});
