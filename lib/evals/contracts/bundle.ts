import { z } from "zod";
import { caseSchema, rubricSchema, sourceSchema } from "./cases";
import { manifestSchema } from "./manifest";
import { assessmentSchema, observationSchema } from "./results";
import { jsonSchemaDocumentSchema, toolFixtureSchema } from "./scenarios";
import { hashSchema, idSchema, safePathSchema } from "./primitives";
import { canonicalJson, verifyContentHash, verifyFile } from "./hashing";

export const bundleSchema = z.strictObject({ manifest: manifestSchema, cases: z.array(caseSchema), sources: z.array(sourceSchema), rubrics: z.array(rubricSchema), fixtures: z.array(toolFixtureSchema), output_schemas: z.array(z.strictObject({ id: idSchema, content_hash: hashSchema, schema: jsonSchemaDocumentSchema })), observations: z.array(observationSchema), assessments: z.array(assessmentSchema) }).superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) issue(`Duplicate ${label}`); };
  const cases = new Map(b.cases.map((c) => [c.revision_id, c]));
  const sources = new Map(b.sources.map((s) => [s.revision_id, s]));
  const rubrics = new Map(b.rubrics.map((r) => [r.revision_id, r]));
  const fixtures = new Map(b.fixtures.map((f) => [f.fixture_set_id, f]));
  const observations = new Map(b.observations.map((o) => [o.content_hash, o]));
  const assessments = new Map(b.assessments.map((a) => [a.assessment_id, a]));
  unique(b.cases.map((c) => c.revision_id), "case revision"); unique(b.cases.map((c) => c.case_id), "case identity");
  unique(b.sources.map((s) => s.revision_id), "source revision"); unique(b.rubrics.map((r) => r.revision_id), "rubric revision");
  unique(b.fixtures.map((f) => f.fixture_set_id), "fixture set"); unique(b.fixtures.map((f) => f.revision_id), "fixture revision"); unique(b.output_schemas.map((s) => s.id), "output schema");
  unique(b.observations.map((o) => o.observation_id), "observation identity"); unique(b.observations.map((o) => o.attempt_id), "attempt identity"); unique(b.assessments.map((a) => a.assessment_id), "assessment identity");
  for (const [refs, records] of [[b.manifest.case_revisions, b.cases], [b.manifest.source_revisions, b.sources], [b.manifest.rubric_revisions, b.rubrics], [b.manifest.fixture_revisions, b.fixtures], [b.manifest.output_schema_revisions, b.output_schemas.map((s) => ({ revision_id: s.id, content_hash: s.content_hash }))]] as const) {
    if (refs.length !== records.length) issue("Manifest inventory does not match bundle");
    for (const ref of refs) if (!records.some((r) => r.revision_id === ref.revision_id && r.content_hash === ref.content_hash)) issue(`Unresolved revision/hash: ${ref.revision_id}`);
  }
  const checkSources = (refs: { source_revision_id: string; anchor: string }[]) => { for (const ref of refs) if (!sources.get(ref.source_revision_id)?.anchors.some((a) => a.id === ref.anchor)) issue(`Unresolved source anchor: ${ref.source_revision_id}/${ref.anchor}`); };
  for (const source of b.sources) unique(source.anchors.map((a) => a.id), "source anchor");
  for (const rubric of b.rubrics) unique(rubric.criteria.map((c) => c.id), "rubric criterion");
  for (const c of b.cases) {
    const ref = b.manifest.case_revisions.find((r) => r.revision_id === c.revision_id);
    if (!ref || ref.case_id !== c.case_id || ref.family_id !== c.family_id || ref.split !== c.split || ref.weight !== c.weight) issue("Manifest case metadata mismatch");
    if (!rubrics.has(c.reference.rubric_revision_id)) issue("Unresolved case rubric");
    checkSources(c.reference.source_refs);
    if (b.manifest.evidence_policy === "source_grounded" && !c.reference.source_refs.length) issue("Source-grounded case has no evidence");
    if (["source_supported", "expert_reviewed"].includes(c.provenance.evidence_level) && !c.reference.source_refs.length) issue("Supported evidence requires sources");
    if (c.scenario.tool_fixture_set_id && !fixtures.has(c.scenario.tool_fixture_set_id)) issue("Unresolved tool fixture");
    for (const grader of c.reference.graders) {
      if (grader.kind === "json_schema" && !b.output_schemas.some((s) => s.id === grader.schema_ref)) issue("Unresolved output schema");
      if (grader.kind === "human" && !rubrics.has(grader.rubric_revision_id)) issue("Unresolved grader rubric");
    }
    for (const key of ["max_turns", "max_output_tokens", "max_tool_calls", "timeout_ms", "repetitions"] as const) if (c.limits[key] > b.manifest.execution_policy.limits[key]) issue(`Case exceeds execution limit: ${key}`);
  }
  for (const o of b.observations) {
    const c = cases.get(o.case_revision_id);
    if (!c || o.repetition >= c.limits.repetitions) issue("Unresolved observation case or repetition outside plan");
    if (b.manifest.execution_mode === "imported_responses") for (const m of Object.values(o.metadata)) if (m.provenance !== "unavailable" && m.provenance !== "customer_reported") issue("Imported measurements must be customer_reported or unavailable");
  }
  for (const a of b.assessments) {
    const o = observations.get(a.observation_hash); const rubric = rubrics.get(a.rubric_revision_id);
    if (!o || !rubric) issue("Unresolved assessment observation or rubric");
    if (o && cases.get(o.case_revision_id)?.reference.rubric_revision_id !== a.rubric_revision_id) issue("Assessment rubric differs from frozen case rubric");
    if (a.outcome !== "unscorable" && (a.criteria.length !== rubric?.criteria.length || a.criteria.some((c) => c.score === null))) issue("Scored assessment requires all rubric criteria");
    if (o && o.status !== "succeeded" && a.outcome !== "unscorable") issue("Execution failures cannot be scored as model failures");
    if (o && cases.get(o.case_revision_id)?.provenance.evidence_level === "disputed" && (a.outcome !== "unscorable" || a.review_status !== "disputed")) issue("Disputed ground truth requires disputed unscorable assessment");
    checkSources(a.evidence_refs); unique(a.criteria.map((c) => c.criterion_id), "assessment criterion");
    for (const score of a.criteria) { const criterion = rubric?.criteria.find((c) => c.id === score.criterion_id); if (!criterion || (score.score !== null && score.score > criterion.max_score)) issue("Unknown criterion or score out of bounds"); }
    if (a.supersedes_assessment_id) { const previous = assessments.get(a.supersedes_assessment_id); if (!previous || previous.observation_hash !== a.observation_hash || Date.parse(previous.created_at) > Date.parse(a.created_at)) issue("Invalid superseded assessment"); }
    const visited = new Set<string>(); let cursor: typeof a | undefined = a;
    while (cursor) { if (visited.has(cursor.assessment_id)) { issue("Assessment supersession cycle"); break; } visited.add(cursor.assessment_id); cursor = cursor.supersedes_assessment_id ? assessments.get(cursor.supersedes_assessment_id) : undefined; }
  }
});
export type CefBundle = z.infer<typeof bundleSchema>;
/** Parse structure and semantic references; verify every immutable logical record. */
export function parseBundle(input: unknown): CefBundle {
  const bundle = bundleSchema.parse(input);
  for (const record of [bundle.manifest, ...bundle.cases, ...bundle.sources, ...bundle.rubrics, ...bundle.fixtures, ...bundle.output_schemas, ...bundle.observations, ...bundle.assessments]) verifyContentHash(record);
  return bundle;
}
export function verifyBundleFiles(bundleInput: unknown, files: ReadonlyMap<string, Uint8Array>): CefBundle {
  const bundle = parseBundle(bundleInput);
  if (files.size !== bundle.manifest.files.length) throw new Error("File inventory mismatch");
  for (const [path] of files) safePathSchema.parse(path);
  for (const file of bundle.manifest.files) { const bytes = files.get(file.path); if (!bytes) throw new Error(`Missing file: ${file.path}`); verifyFile(bytes, file); }
  for (const artifact of [...bundle.sources.map((s) => s.artifact), ...bundle.cases.flatMap((c) => c.scenario.attachments), ...bundle.observations.flatMap((o) => o.artifacts)]) {
    const bytes = files.get(artifact.path); if (!bytes) throw new Error(`Missing artifact: ${artifact.path}`); verifyFile(bytes, artifact);
  }
  return bundle;
}
export const DEFAULT_PARSE_LIMITS = { max_bytes: 32 * 1024 * 1024, max_records: 100_000, max_line_bytes: 2 * 1024 * 1024, max_depth: 64 } as const;
export function parseJsonBytes(bytes: Uint8Array, maxBytes = DEFAULT_PARSE_LIMITS.max_bytes): unknown {
  if (bytes.byteLength > maxBytes) throw new Error("JSON byte limit exceeded");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  // Check bounds and duplicate decoded keys before JSON.parse can discard evidence.
  const stack: { object: boolean; key: boolean; keys: Set<string> }[] = [];
  let quoted = false; let escaped = false; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        quoted = false;
        const frame = stack.at(-1);
        if (frame?.object && frame.key) {
          const key: string = JSON.parse(text.slice(start, i + 1));
          if (frame.keys.has(key)) throw new Error("Duplicate JSON object key");
          frame.keys.add(key); frame.key = false;
        }
      }
    } else if (char === '"') { quoted = true; start = i; }
    else if (char === "{" || char === "[") {
      stack.push({ object: char === "{", key: char === "{", keys: new Set() });
      if (stack.length > DEFAULT_PARSE_LIMITS.max_depth) throw new Error("JSON nesting limit exceeded");
    } else if (char === "}" || char === "]") stack.pop();
    else if (char === ",") { const frame = stack.at(-1); if (frame?.object) frame.key = true; }
  }
  return JSON.parse(text);
}
export function parseJsonl<T>(bytes: Uint8Array, schema: z.ZodType<T>): T[] {
  if (bytes.byteLength > DEFAULT_PARSE_LIMITS.max_bytes) throw new Error("JSONL byte limit exceeded");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split("\n"); if (lines.at(-1) === "") lines.pop();
  if (lines.length > DEFAULT_PARSE_LIMITS.max_records) throw new Error("JSONL record limit exceeded");
  return lines.map((line, index) => { try { return schema.parse(parseJsonBytes(Buffer.from(line), DEFAULT_PARSE_LIMITS.max_line_bytes)); } catch (error) { throw new Error(`JSONL line ${index + 1}: ${error instanceof Error ? error.message : "invalid record"}`); } });
}
export function serializeJsonl(records: readonly unknown[]): string { return records.map(canonicalJson).join("\n") + (records.length ? "\n" : ""); }
