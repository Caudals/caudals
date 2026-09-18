import { z } from "zod";
import { parseBundle, type CefBundle } from "./bundle";
import { artifactSchema, hashSchema, idSchema, jsonValueSchema, languageSchema, messageSchema, schemaVersionSchema } from "./primitives";
import { referenceSchema } from "./cases";
import { toolDefinitionSchema } from "./scenarios";
import { withContentHash } from "./hashing";

export const candidateInputSchema = z.strictObject({
  schema_version: schemaVersionSchema, case_id: idSchema, case_revision_id: idSchema,
  messages: z.array(messageSchema), attachments: z.array(artifactSchema), tools: z.array(toolDefinitionSchema),
});
const visibleSourceSchema = z.strictObject({ source_revision_id: idSchema, title: z.string(), anchors: z.array(z.strictObject({ id: idSchema, excerpt: z.string(), locator: z.string() })) });
const visibleReferenceSchema = referenceSchema.omit({ derivation_notes: true });
const visibleCaseSchema = z.strictObject({ input: candidateInputSchema, title: z.string(), language: languageSchema, reference: visibleReferenceSchema, evidence_level: z.string(), rights: z.string() });
const exportCaseSchema = visibleCaseSchema.extend({ reference: visibleReferenceSchema.omit({ graders: true, rubric_revision_id: true }) });
const envelope = { schema_version: schemaVersionSchema, suite_id: idSchema, suite_version_id: idSchema, origin_manifest_hash: hashSchema, content_hash: hashSchema };
export const candidateProjectionSchema = z.strictObject({ ...envelope, audience: z.literal("candidate"), cases: z.array(candidateInputSchema) });
export const judgeProjectionSchema = z.strictObject({ ...envelope, audience: z.literal("judge"), cases: z.array(visibleCaseSchema), sources: z.array(visibleSourceSchema), rubrics: z.array(z.strictObject({ revision_id: idSchema, criteria: z.array(z.strictObject({ id: idSchema, description: z.string(), weight: z.number(), max_score: z.number() })) })), observations: z.array(z.strictObject({ content_hash: hashSchema, case_revision_id: idSchema, status: z.string(), messages: z.array(messageSchema), tool_events: z.array(jsonValueSchema) })) });
export const customerProjectionSchema = z.strictObject({ ...envelope, audience: z.literal("customer"), cases: z.array(exportCaseSchema), sources: z.array(visibleSourceSchema) });
export const publicProjectionSchema = z.strictObject({ ...envelope, audience: z.literal("public"), publication_consent_id: idSchema, cases: z.array(exportCaseSchema), sources: z.array(visibleSourceSchema) });
export type CandidateInput = z.infer<typeof candidateInputSchema>;

function envelopeFor(b: CefBundle) { return { schema_version: "1.0" as const, suite_id: b.manifest.suite_id, suite_version_id: b.manifest.suite_version_id, origin_manifest_hash: b.manifest.content_hash }; }
function inputFor(b: CefBundle, c: CefBundle["cases"][number]): CandidateInput {
  const fixture = b.fixtures.find((f) => f.fixture_set_id === c.scenario.tool_fixture_set_id);
  return candidateInputSchema.parse({ schema_version: "1.0", case_id: c.case_id, case_revision_id: c.revision_id,
    messages: c.scenario.messages.map((m) => ({ role: m.role, content: m.content, ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) })),
    attachments: c.scenario.attachments.map((a) => ({ path: a.path, sha256: a.sha256, size_bytes: a.size_bytes, media_type: a.media_type, visibility: a.visibility })),
    tools: fixture?.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, output_schema: t.output_schema })) ?? [],
  });
}
export function projectCandidate(input: unknown) {
  const b = parseBundle(input); const policy = b.manifest.visibility_policy;
  if (!policy.cases.candidate) throw new Error("Candidate access is disabled");
  return candidateProjectionSchema.parse(withContentHash({ ...envelopeFor(b), audience: "candidate", cases: b.cases.filter((c) => c.split !== "holdout" || policy.allow_candidate_holdout).map((c) => inputFor(b, c)) }));
}
function visibleData(b: CefBundle, audience: "judge" | "customer" | "public") {
  if (!b.manifest.visibility_policy.cases[audience]) throw new Error(`${audience} access is disabled`);
  const sources = b.manifest.visibility_policy.sources[audience] ? b.sources.filter((s) => s.access[audience]) : [];
  const visible = new Set(sources.map((s) => s.revision_id));
  const cases = b.cases.filter((c) => audience === "judge" || c.split !== "holdout").map((c) => {
    if (c.reference.source_refs.some((r) => !visible.has(r.source_revision_id))) throw new Error("Reference includes a source not permitted for this audience");
    const r = c.reference;
    return { input: inputFor(b, c), title: c.title, language: c.language,
      reference: { answerability: r.answerability, expected: r.expected, acceptable_alternatives: r.acceptable_alternatives, required_claims: r.required_claims, prohibited_claims: r.prohibited_claims, prohibited_actions: r.prohibited_actions, source_refs: r.source_refs, rubric_revision_id: r.rubric_revision_id, graders: r.graders },
      evidence_level: c.provenance.evidence_level, rights: c.provenance.rights };
  });
  return { cases, sources: sources.map((s) => ({ source_revision_id: s.revision_id, title: s.title, anchors: s.anchors.map((a) => ({ id: a.id, excerpt: a.excerpt, locator: a.locator })) })) };
}
export function projectJudge(input: unknown) {
  const b = parseBundle(input); const p = b.manifest.visibility_policy;
  if (!p.rubrics.judge || !p.observations.judge) throw new Error("Judge rubric/observation access is disabled");
  return judgeProjectionSchema.parse(withContentHash({ ...envelopeFor(b), audience: "judge", ...visibleData(b, "judge"),
    rubrics: b.rubrics.map((r) => ({ revision_id: r.revision_id, criteria: r.criteria.map((c) => ({ id: c.id, description: c.description, weight: c.weight, max_score: c.max_score })) })),
    observations: b.observations.map((o) => ({ content_hash: o.content_hash, case_revision_id: o.case_revision_id, status: o.status, messages: o.messages, tool_events: o.tool_events })),
  }));
}
function exportData(b: CefBundle, audience: "customer" | "public") {
  const data = visibleData(b, audience);
  // Candidate-only artifact grants do not authorize redistributing bytes publicly/to a customer.
  if (data.cases.some((c) => c.input.attachments.length)) throw new Error("Attachments require explicit export clearance");
  return { sources: data.sources, cases: data.cases.map((c) => ({ ...c, reference: { answerability: c.reference.answerability, expected: c.reference.expected, acceptable_alternatives: c.reference.acceptable_alternatives, required_claims: c.reference.required_claims, prohibited_claims: c.reference.prohibited_claims, prohibited_actions: c.reference.prohibited_actions, source_refs: c.reference.source_refs } })) };
}
export function projectCustomer(input: unknown) {
  const b = parseBundle(input);
  return customerProjectionSchema.parse(withContentHash({ ...envelopeFor(b), audience: "customer", ...exportData(b, "customer") }));
}
export function projectPublic(input: unknown) {
  const b = parseBundle(input); const consent = b.manifest.visibility_policy.publication_consent_id;
  if (!consent) throw new Error("Public release requires recorded publication consent");
  const allowedRights = new Set(["caudals_owned_synthetic", "caudals_owned", "public_domain"]);
  if (b.cases.some((c) => !allowedRights.has(c.provenance.rights)) || b.sources.some((s) => s.access.public && !allowedRights.has(s.rights))) throw new Error("Public release rights require separate clearance");
  return publicProjectionSchema.parse(withContentHash({ ...envelopeFor(b), audience: "public", publication_consent_id: consent, ...exportData(b, "public") }));
}
