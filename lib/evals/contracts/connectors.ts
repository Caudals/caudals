import { z } from "zod";
import { capabilitySchema, idSchema, limitsSchema, moneySchema, safePathSchema, schemaVersionSchema, selectorSchema, timestampSchema } from "./primitives";
import type { CandidateInput } from "./projections";
import type { Observation } from "./results";

const endpoint = z.url().refine((url) => { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.hash && !u.search; }, "HTTPS endpoint without credentials, query or fragment required");
const credential = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("none") }), z.strictObject({ kind: z.enum(["bearer", "header_token"]), secret_version_id: idSchema, header_name: z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/) })]);
const base = { schema_version: schemaVersionSchema, target_revision_id: idSchema, limits: limitsSchema, requests_per_minute: z.int().positive(), concurrent_sessions: z.int().positive(), reset: z.enum(["fresh_session", "explicit_reset", "unsupported"]) };
export const targetConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("openai_compatible"), endpoint, model: z.string().min(1), credential }),
  z.strictObject({ ...base, kind: z.literal("provider_native"), provider: idSchema, model: z.string().min(1), credential }),
  z.strictObject({ ...base, kind: z.literal("https_json"), endpoint, credential, mapping: z.strictObject({ messages_path: selectorSchema, conversation_id_path: selectorSchema.nullable(), documents_path: selectorSchema.nullable(), tools_path: selectorSchema.nullable(), response_text_path: selectorSchema }) }),
  z.strictObject({ ...base, kind: z.literal("website"), endpoint, recipe_revision_id: idSchema.nullable(), login_session_id: idSchema.nullable() }),
  z.strictObject({ ...base, kind: z.literal("imported_responses"), source_path: safePathSchema, mapping_revision_id: idSchema }),
  z.strictObject({ ...base, kind: z.literal("private_runner"), runner_id: idSchema, connector_version: idSchema }),
]);
export const capabilityReportSchema = z.strictObject({ checked_at: timestampSchema, features: z.array(z.strictObject({ capability: capabilitySchema, status: z.enum(["supported", "unsupported", "unknown"]), evidence_artifact_id: idSchema.nullable() })) }).superRefine((r, ctx) => { if (new Set(r.features.map((f) => f.capability)).size !== capabilitySchema.options.length || r.features.length !== capabilitySchema.options.length) ctx.addIssue({ code: "custom", message: "Report must declare each capability exactly once" }); });
export const connectionCheckSchema = z.discriminatedUnion("status", [z.strictObject({ status: z.literal("ready"), checked_at: timestampSchema, capabilities: capabilityReportSchema }), z.strictObject({ status: z.enum(["failed", "needs_operator"]), checked_at: timestampSchema, error_code: idSchema })]);
export const sessionHandleSchema = z.strictObject({ session_id: idSchema, target_revision_id: idSchema });
export const executionContextSchema = z.strictObject({ run_id: idSchema, target_revision_id: idSchema, execution_plan_id: idSchema, tenant_scope_handle: idSchema });
export const invocationMetadataSchema = z.strictObject({ ...executionContextSchema.shape, deadline: timestampSchema, attempt_id: idSchema, scoped_credential_handle: idSchema.nullable(), destination_policy_id: idSchema, reserved_cost: moneySchema });
export type TargetConfig = z.infer<typeof targetConfigSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type CapabilityReport = z.infer<typeof capabilityReportSchema>;
export type ConnectionCheck = z.infer<typeof connectionCheckSchema>;
export type SessionHandle = z.infer<typeof sessionHandleSchema>;
export type ExecutionContext = z.infer<typeof executionContextSchema>;
export type InvocationContext = z.infer<typeof invocationMetadataSchema> & { signal: AbortSignal };
export interface TargetAdapter {
  validate(config: TargetConfig): Promise<ConnectionCheck>;
  capabilities(config: TargetConfig): Promise<CapabilityReport>;
  openSession(ctx: ExecutionContext): Promise<SessionHandle>;
  invoke(input: CandidateInput, ctx: InvocationContext): Promise<Observation>;
  closeSession(session: SessionHandle): Promise<void>;
}
