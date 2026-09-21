import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { createPaymentRecord, listPaymentRecords } from "@/lib/evals/experts/store";

export const runtime = "nodejs";
const id = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
function operator(role: string | null) { if (!role) throw new EvalError("SCOPE_DENIED", 404); }
export const GET = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return listPaymentRecords({ orgId, actorId: identity.user.id }, id(request));
});
export const POST = api(async (request, identity) => {
  requireStageEEnabled(); operator(identity.platformRole);
  const input = z.strictObject({
    orgId: z.uuid(), amount: z.string().regex(/^\d{1,15}(?:\.\d{1,9})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/), status: z.enum(["planned", "invoiced", "paid", "void"]),
    note: z.string().max(4_000),
  }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "manage");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  return createPaymentRecord(
    { orgId: input.orgId, actorId: identity.user.id },
    { assignmentId: id(request), amount: input.amount, currency: input.currency, status: input.status, note: input.note }, key,
  );
});
