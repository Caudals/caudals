import { z } from "zod";
import { accessSchema, artifactSchema, decimalSchema, extensionsSchema, hashSchema, idSchema, jsonValueSchema, languageSchema, limitsSchema, nonnegativeDecimalSchema, rightsSchema, schemaVersionSchema, selectorSchema, sourceRefSchema, splitSchema, timestampSchema } from "./primitives";
import { conditionSchema, scenarioSchema } from "./scenarios";

export const graderSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("json_schema"), schema_ref: idSchema }),
  z.strictObject({ kind: z.literal("decimal_equal"), path: selectorSchema, expected: decimalSchema, tolerance: nonnegativeDecimalSchema, rounding: z.enum(["half_up", "half_even", "down", "up"]), unit: z.string().min(1) }),
  z.strictObject({ kind: z.literal("exact_match"), expected: jsonValueSchema, path: selectorSchema, case_sensitive: z.boolean() }),
  z.strictObject({ kind: z.literal("claims"), required: z.array(z.string().min(1)), prohibited: z.array(z.string().min(1)) }),
  z.strictObject({ kind: z.literal("llm_judge"), model_revision_id: idSchema, prompt_revision_id: idSchema, calibration_revision_id: idSchema.nullable() }),
  z.strictObject({ kind: z.literal("human"), rubric_revision_id: idSchema }),
  z.strictObject({ kind: z.literal("tool_state"), predicates: z.array(conditionSchema).min(1) }),
]);
export const referenceSchema = z.strictObject({
  answerability: z.enum(["answerable", "missing_information", "unanswerable", "must_abstain"]), expected: jsonValueSchema,
  acceptable_alternatives: z.array(jsonValueSchema), required_claims: z.array(z.string()), prohibited_claims: z.array(z.string()), prohibited_actions: z.array(z.string()),
  source_refs: z.array(sourceRefSchema), rubric_revision_id: idSchema, graders: z.array(graderSchema).min(1),
  derivation_notes: z.string().optional(),
});
export const provenanceSchema = z.strictObject({
  method: z.enum(["deterministic_fixture", "human_authored", "synthetic", "customer_import", "log_derived"]), generator_revision: idSchema.nullable(), prompt_revision: idSchema.nullable(),
  evidence_level: z.enum(["unverified", "customer_supplied_unreviewed", "source_supported", "expert_reviewed", "disputed"]),
  author_ids: z.array(idSchema).min(1), reviewer_ids: z.array(idSchema), rights: rightsSchema, created_at: timestampSchema,
}).superRefine((p, ctx) => {
  if (p.method === "synthetic" && (!p.generator_revision || !p.prompt_revision)) ctx.addIssue({ code: "custom", message: "Synthetic cases require frozen generator and prompt revisions" });
  if (p.evidence_level === "expert_reviewed" && !p.reviewer_ids.length) ctx.addIssue({ code: "custom", message: "Expert review requires reviewer attribution" });
});
export const caseSchema = z.strictObject({
  schema_version: schemaVersionSchema, case_id: idSchema, revision_id: idSchema, content_hash: hashSchema, family_id: idSchema,
  title: z.string().min(1), task_type: z.enum(["grounded_qa", "numerical", "extraction", "classification", "conversation", "tool_workflow"]), domain: z.string().min(1), tags: z.array(z.string().min(1)), language: languageSchema,
  jurisdiction: z.string().min(1).nullable(), as_of: timestampSchema.nullable(), difficulty: z.enum(["routine", "advanced", "challenge"]), severity: z.enum(["low", "medium", "high", "critical"]), split: splitSchema,
  scenario: scenarioSchema, reference: referenceSchema, provenance: provenanceSchema, limits: limitsSchema, weight: z.number().positive(), extensions: extensionsSchema,
}).superRefine((c, ctx) => {
  if (c.scenario.attachments.some((a) => a.visibility !== "candidate")) ctx.addIssue({ code: "custom", message: "Scenario attachments must be candidate-visible" });
  if (c.task_type === "conversation" && c.scenario.mode !== "conversation") ctx.addIssue({ code: "custom", message: "Conversation task requires conversation scenario" });
  if (c.task_type === "tool_workflow" && c.scenario.mode !== "tool_workflow") ctx.addIssue({ code: "custom", message: "Tool workflow requires tool scenario" });
  if (c.scenario.mode === "conversation" && !c.scenario.required_capabilities.includes("multi_turn")) ctx.addIssue({ code: "custom", message: "Conversation requires multi_turn capability" });
  if (c.scenario.mode === "tool_workflow" && (!c.scenario.required_capabilities.includes("tool_calls") || c.limits.max_tool_calls === 0)) ctx.addIssue({ code: "custom", message: "Tool workflow requires tool capability and budget" });
});
export const sourceSchema = z.strictObject({
  schema_version: schemaVersionSchema, source_id: idSchema, revision_id: idSchema, content_hash: hashSchema, title: z.string().min(1),
  artifact: artifactSchema, anchors: z.array(z.strictObject({ id: idSchema, excerpt: z.string().min(1), locator: z.string().min(1) })).min(1),
  access: accessSchema, rights: rightsSchema, created_at: timestampSchema, extensions: extensionsSchema,
});
export const rubricSchema = z.strictObject({
  schema_version: schemaVersionSchema, rubric_id: idSchema, revision_id: idSchema, content_hash: hashSchema, title: z.string().min(1),
  criteria: z.array(z.strictObject({ id: idSchema, description: z.string().min(1), weight: z.number().positive(), max_score: z.number().positive() })).min(1),
  derivation_notes: z.string().nullable(), created_at: timestampSchema, extensions: extensionsSchema,
});
export type CefCase = z.infer<typeof caseSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
