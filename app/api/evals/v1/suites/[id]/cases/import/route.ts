import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { referenceEditSchema } from "@/lib/evals/contracts/reference-edits";
import { importSuiteDraftCases } from "@/lib/evals/repositories/evidence";

export const runtime = "nodejs";

const itemSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  question: z.string().trim().min(3).max(20000),
  expected: z.string().trim().min(1).max(20000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("high"),
  source: z.strictObject({ quote: z.string().trim().min(8).max(4000), url: z.url().max(2000).optional() }),
  ...referenceEditSchema.shape,
});

// Import hand-written questions, each tied to the source excerpt its answer comes from.
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), items: z.array(itemSchema).min(1).max(100) }).parse(await jsonBody(request));
  const suiteId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-3));
  await requireWorkspace(identity, input.orgId, "write");
  return importSuiteDraftCases({ orgId: input.orgId, actorId: identity.user.id }, suiteId, input.items, request.headers.get("Idempotency-Key") ?? "");
});
