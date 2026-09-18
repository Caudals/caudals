import { z } from "zod";
import { artifactSchema, extensionsSchema, hashSchema, idSchema, jsonValueSchema, messageSchema, moneySchema, schemaVersionSchema, sourceRefSchema, timestampSchema } from "./primitives";

export const measurementProvenanceSchema = z.enum(["provider_reported", "measured", "estimated", "customer_reported"]);
const measurement = <T extends z.ZodType>(value: T) => z.discriminatedUnion("provenance", [
  z.strictObject({ value, provenance: measurementProvenanceSchema }),
  z.strictObject({ value: z.null(), provenance: z.literal("unavailable") }),
]);
export const measuredIntegerSchema = measurement(z.int().nonnegative());
export const measuredCostSchema = measurement(moneySchema);
export const toolEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("call"), call_id: idSchema, tool_name: idSchema, arguments: jsonValueSchema, timestamp: timestampSchema }),
  z.strictObject({ kind: z.literal("result"), call_id: idSchema, result: jsonValueSchema, timestamp: timestampSchema }),
]);
export const executionStatusSchema = z.enum(["succeeded", "target_error", "transport_error", "timeout", "capture_incomplete", "unsupported", "canceled", "unknown_external_outcome"]);
export const sanitizedErrorSchema = z.strictObject({ category: z.enum(["target_error", "transport_error", "timeout", "capture_incomplete", "unsupported", "canceled", "unknown_external_outcome"]), code: idSchema, retryable: z.boolean() });
const observationBase = {
  schema_version: schemaVersionSchema, observation_id: idSchema, content_hash: hashSchema, run_id: idSchema, case_revision_id: idSchema, repetition: z.int().nonnegative(), attempt_id: idSchema, target_revision_id: idSchema,
  started_at: timestampSchema, finished_at: timestampSchema, messages: z.array(messageSchema), tool_events: z.array(toolEventSchema), artifacts: z.array(artifactSchema),
  provider_request_id: z.string().min(1).nullable(), metadata: z.strictObject({ latency_ms: measuredIntegerSchema, input_tokens: measuredIntegerSchema, output_tokens: measuredIntegerSchema, cost: measuredCostSchema, model_identity: measurement(z.string().min(1)) }), extensions: extensionsSchema,
};
export const observationSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...observationBase, status: z.literal("succeeded"), error: z.null() }),
  z.strictObject({ ...observationBase, status: z.enum(["target_error", "transport_error", "timeout", "capture_incomplete", "unsupported", "canceled", "unknown_external_outcome"]), error: sanitizedErrorSchema }),
]).superRefine((o, ctx) => {
  if (Date.parse(o.finished_at) < Date.parse(o.started_at)) ctx.addIssue({ code: "custom", message: "Observation finishes before it starts" });
  if (o.error && o.error.category !== o.status) ctx.addIssue({ code: "custom", message: "Error category must match execution status" });
  const calls = new Set<string>(); const results = new Set<string>();
  for (const event of o.tool_events) {
    if (event.kind === "call") { if (calls.has(event.call_id)) ctx.addIssue({ code: "custom", message: "Duplicate tool call" }); calls.add(event.call_id); }
    else { if (!calls.has(event.call_id) || results.has(event.call_id)) ctx.addIssue({ code: "custom", message: "Unmatched or duplicate tool result" }); results.add(event.call_id); }
  }
});
export const assessmentSchema = z.strictObject({
  schema_version: schemaVersionSchema, assessment_id: idSchema, content_hash: hashSchema, observation_hash: hashSchema, grader_revision_id: idSchema, rubric_revision_id: idSchema,
  criteria: z.array(z.strictObject({ criterion_id: idSchema, score: z.number().nonnegative().nullable(), rationale: z.string().min(1) })),
  outcome: z.enum(["pass", "partial", "fail", "unscorable"]), evidence_refs: z.array(sourceRefSchema), rationale: z.string().min(1),
  review_status: z.enum(["unreviewed", "needs_review", "approved", "disputed"]), supersedes_assessment_id: idSchema.nullable(),
  author: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("grader"), id: idSchema }), z.strictObject({ kind: z.literal("human"), id: idSchema })]),
  override_reason: z.string().min(1).nullable(), created_at: timestampSchema, extensions: extensionsSchema,
}).superRefine((a, ctx) => {
  if (a.supersedes_assessment_id === a.assessment_id) ctx.addIssue({ code: "custom", message: "Assessment cannot supersede itself" });
  if (a.author.kind === "human" && a.supersedes_assessment_id && !a.override_reason) ctx.addIssue({ code: "custom", message: "Human override requires a reason" });
  if (a.outcome === "unscorable" && a.criteria.some((c) => c.score !== null)) ctx.addIssue({ code: "custom", message: "Unscorable criteria have null scores" });
});
export type Observation = z.infer<typeof observationSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
