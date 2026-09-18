import { z } from "zod";
import { accessSchema, extensionsSchema, hashSchema, idSchema, languageSchema, limitsSchema, revisionRefSchema, safePathSchema, schemaVersionSchema, splitSchema, timestampSchema } from "./primitives";

export const executionPolicySchema = z.strictObject({
  limits: limitsSchema, session: z.enum(["fresh_per_case", "fixed_history", "unresettable"]),
  retry: z.strictObject({ max_attempts: z.int().min(1).max(20), retryable_statuses: z.array(z.enum(["transport_error", "timeout", "target_error"])), uncertain_outcome: z.literal("pause_for_review") }),
});
export const scoringPolicySchema = z.strictObject({ metric_version: idSchema, weighting: z.enum(["uniform", "case_weight"]), thresholds: z.strictObject({ pass: z.number().min(0).max(1), partial: z.number().min(0).max(1) }), exclusions: z.array(z.enum(["unsupported", "transport_error", "timeout", "capture_incomplete", "canceled", "unknown_external_outcome", "disputed", "invalid_case"])), review: z.enum(["all", "failures_and_disputes", "sampled"]), comparison: z.enum(["paired_family", "descriptive_only"]) }).superRefine((p, ctx) => { if (p.thresholds.partial > p.thresholds.pass) ctx.addIssue({ code: "custom", message: "Partial threshold exceeds pass threshold" }); });
export const manifestSchema = z.strictObject({
  schema_version: schemaVersionSchema, suite_id: idSchema, suite_version_id: idSchema, title: z.string().min(1), created_at: timestampSchema,
  scope: z.strictObject({ domain: z.string().min(1), languages: z.array(languageSchema).min(1), jurisdictions: z.array(z.string().min(1)), as_of: timestampSchema.nullable(), description: z.string().min(1) }),
  execution_mode: z.enum(["deployed_system", "controlled_model", "imported_responses"]), evidence_policy: z.enum(["exploratory", "source_grounded"]),
  case_revisions: z.array(z.strictObject({ case_id: idSchema, revision_id: idSchema, content_hash: hashSchema, family_id: idSchema, split: splitSchema, weight: z.number().positive() })).min(1),
  source_revisions: z.array(revisionRefSchema), rubric_revisions: z.array(revisionRefSchema), fixture_revisions: z.array(revisionRefSchema), output_schema_revisions: z.array(revisionRefSchema),
  execution_policy: executionPolicySchema, scoring_policy: scoringPolicySchema,
  sampling_plan: z.strictObject({ procedure: z.enum(["all", "random", "stratified", "manual"]), seed: z.int().nonnegative(), planned_repetitions: z.int().positive().max(1000), stopping_rules: z.strictObject({ max_cases: z.int().positive(), max_duration_ms: z.int().positive(), early_stopping: z.literal(false) }) }),
  visibility_policy: z.strictObject({ cases: accessSchema, sources: accessSchema, rubrics: accessSchema, observations: accessSchema, assessments: accessSchema, allow_candidate_holdout: z.boolean(), publication_consent_id: idSchema.nullable() }),
  files: z.array(z.strictObject({ path: safePathSchema, sha256: hashSchema, size_bytes: z.int().nonnegative() })), content_hash: hashSchema, extensions: extensionsSchema,
}).superRefine((m, ctx) => {
  const families = new Map<string, string>();
  for (const c of m.case_revisions) { if (families.has(c.family_id) && families.get(c.family_id) !== c.split) ctx.addIssue({ code: "custom", message: `Family split overlap: ${c.family_id}` }); families.set(c.family_id, c.split); }
  for (const entries of [m.case_revisions, m.source_revisions, m.rubric_revisions, m.fixture_revisions, m.output_schema_revisions]) if (new Set(entries.map((r) => r.revision_id)).size !== entries.length) ctx.addIssue({ code: "custom", message: "Duplicate revision ID" });
  if (new Set(m.case_revisions.map((c) => c.case_id)).size !== m.case_revisions.length) ctx.addIssue({ code: "custom", message: "Duplicate logical case ID" });
  if (new Set(m.files.map((f) => f.path.toLowerCase())).size !== m.files.length) ctx.addIssue({ code: "custom", message: "Duplicate or case-colliding file paths" });
  if (m.files.some((f) => f.path === "manifest.json")) ctx.addIssue({ code: "custom", message: "Manifest cannot checksum itself" });
  if (m.visibility_policy.rubrics.candidate || m.visibility_policy.assessments.candidate) ctx.addIssue({ code: "custom", message: "Private grading data is never candidate-visible" });
  if (Object.values(m.visibility_policy).some((v) => typeof v === "object" && v !== null && "public" in v && v.public) && !m.visibility_policy.publication_consent_id) ctx.addIssue({ code: "custom", message: "Public release requires recorded publication consent" });
});
export type Manifest = z.infer<typeof manifestSchema>;
