import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { candidateProjectionSchema, customerProjectionSchema, judgeProjectionSchema, publicProjectionSchema, assertImmutableRevision, validateFamilySplits, decodeCefFiles, encodeCefFiles, bundleSchema, canonicalJson, caseSchema, contentHash, exportJsonSchemas, manifestSchema, parseBundle, parseJsonBytes, parseJsonl, projectCandidate, projectCustomer, projectJudge, projectPublic, safePathSchema, serializeJsonl, sha256, verifyBundleFiles, verifyContentHash, verifyFile, withContentHash, observationSchema, assessmentSchema, capabilityReportSchema, capabilitySchema, targetConfigSchema, languageSchema } from "../../lib/evals/contracts";
import { fixtureNames, makeFixture } from "./fixtures/contracts-fixtures";

function rehash(b: ReturnType<typeof makeFixture>) {
  b.cases = b.cases.map(withContentHash); b.sources = b.sources.map(withContentHash); b.rubrics = b.rubrics.map(withContentHash); b.fixtures = b.fixtures.map(withContentHash);
  b.manifest.case_revisions = b.cases.map((c) => ({ case_id: c.case_id, revision_id: c.revision_id, content_hash: c.content_hash, family_id: c.family_id, split: c.split, weight: c.weight }));
  b.manifest.source_revisions = b.sources.map((s) => ({ revision_id: s.revision_id, content_hash: s.content_hash }));
  b.manifest.rubric_revisions = b.rubrics.map((s) => ({ revision_id: s.revision_id, content_hash: s.content_hash }));
  b.manifest = withContentHash(b.manifest); return b;
}
describe("CEF 1.0 conformance", () => {
  it.each(fixtureNames)("%s validates and round-trips without loss", (name) => {
    const fixture = makeFixture(name); expect(parseBundle(JSON.parse(canonicalJson(fixture)))).toEqual(fixture);
    expect(parseJsonl(Buffer.from(serializeJsonl(fixture.cases)), caseSchema)).toEqual(fixture.cases);
    const saved = JSON.parse(readFileSync(resolve("tests/evals/fixtures", `${name}.json`), "utf8"));
    expect(parseBundle(saved)).toEqual(fixture);
    const artifacts = new Map([[fixture.sources[0].artifact.path, Buffer.from(fixture.sources[0].anchors[0].excerpt)]]);
    const bytes = encodeCefFiles(fixture, artifacts, "Synthetic CEF 1.0 conformance fixture. No real tax claims.\n");
    const decoded = decodeCefFiles(bytes);
    expect({ ...decoded, manifest: fixture.manifest }).toEqual(fixture);
    expect(encodeCefFiles(decoded, artifacts, "Synthetic CEF 1.0 conformance fixture. No real tax claims.\n")).toEqual(bytes);
  });
  it("keeps unavailable imported usage null", () => {
    const b = parseBundle(makeFixture("imported-response-unknown-usage"));
    expect(b.observations[0].metadata.cost).toEqual({ value: null, provenance: "unavailable" });
    b.observations[0].metadata.input_tokens = { value: 0, provenance: "measured" };
    expect(bundleSchema.safeParse(b).success).toBe(false);
  });
  it("retains bounded correction and tool state semantics", () => {
    const conversation = parseBundle(makeFixture("multi-turn-correction"));
    expect(conversation.cases[0].scenario.turn_plan?.nodes[0].max_visits).toBe(1);
    const tools = parseBundle(makeFixture("deterministic-tool-call"));
    expect(tools.fixtures[0].side_effects).toBe("simulated_only");
    expect(tools.observations[0].tool_events).toHaveLength(2);
  });
});
describe("canonical identity and verification", () => {
  it("uses stable key order, array order and JSON number encoding", () => {
    expect(canonicalJson({ z: 1, a: [true, -0, 1e30] })).toBe('{"a":[true,0,1e+30],"z":1}');
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2, content_hash: "ignored" }));
    expect(contentHash({ a: [1, 2] })).not.toBe(contentHash({ a: [2, 1] }));
  });
  it.each([NaN, Infinity, undefined, BigInt(1), new Date(), "\ud800", [, 1], { a: undefined }])("rejects noncanonical JSON %s", (value) => expect(() => canonicalJson(value)).toThrow());
  it("rejects cycles without executing object accessors", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; expect(() => canonicalJson(cyclic)).toThrow();
    expect(() => canonicalJson({ get secret() { throw new Error("accessed"); } })).toThrow("Accessors");
  });
  it("rejects altered record, manifest and output-schema hashes", () => {
    for (const mutate of [(b: ReturnType<typeof makeFixture>) => { b.cases[0].title = "changed"; }, (b: ReturnType<typeof makeFixture>) => { b.manifest.title = "changed"; }, (b: ReturnType<typeof makeFixture>) => { b.output_schemas[0].schema.type = "string"; }]) { const b = makeFixture("single-turn-arithmetic"); mutate(b); expect(() => parseBundle(b)).toThrow("hash"); }
    expect(() => verifyContentHash({ content_hash: "0".repeat(64) })).toThrow();
  });
  it("binds exact bytes and file inventories", () => {
    const b = makeFixture("single-turn-arithmetic"); const bytes = Buffer.from(b.sources[0].anchors[0].excerpt);
    const files = new Map([[b.sources[0].artifact.path, bytes]]);
    expect(verifyBundleFiles(b, files)).toEqual(b);
    expect(() => verifyFile(Buffer.from("corrupt"), b.sources[0].artifact)).toThrow();
    expect(() => verifyBundleFiles(b, new Map())).toThrow();
    files.set("extra.txt", bytes); expect(() => verifyBundleFiles(b, files)).toThrow();
  });
  it("material edits yield distinct revision content without mutating the original", () => {
    const original = makeFixture("single-turn-arithmetic"); const changed = structuredClone(original);
    changed.cases[0].reference.expected = { total: "999" }; rehash(changed);
    expect(changed.cases[0].content_hash).not.toBe(original.cases[0].content_hash);
    expect(changed.manifest.content_hash).not.toBe(original.manifest.content_hash);
    expect(original.cases[0].reference.expected).toEqual({ total: "135.80", currency: "EUR" });
  });
});
describe("strict schemas, paths and bounded decoding", () => {
  it.each(["2.0", "1.1", "0.9", "1", 1])("rejects unsupported version %s", (version) => { const b = makeFixture("single-turn-arithmetic"); expect(manifestSchema.safeParse({ ...b.manifest, schema_version: version }).success).toBe(false); expect(caseSchema.safeParse({ ...b.cases[0], schema_version: version }).success).toBe(false); });
  it("rejects unknown core properties and unnamespaced extensions", () => {
    const c = makeFixture("single-turn-arithmetic").cases[0];
    expect(caseSchema.safeParse({ ...c, secret: true }).success).toBe(false);
    expect(caseSchema.safeParse({ ...c, limits: { ...c.limits, extra: 1 } }).success).toBe(false);
    expect(caseSchema.safeParse({ ...c, extensions: { vendor: true } }).success).toBe(false);
  });
  it.each(["../x", "/x", "a/../x", "a/./x", "a//x", "C:/x", "a\\x", "%2e%2e/x", "a\u0000x", "a/", "a.", "CON.txt", "a/NUL", "a/COM1.txt"])("rejects unsafe path %s", (path) => expect(safePathSchema.safeParse(path).success).toBe(false));
  it.each(["fixtures/policy.txt", "cases.jsonl", "a_b-2/c.d"])("permits safe path %s", (path) => expect(safePathSchema.safeParse(path).success).toBe(true));
  it("rejects duplicate file paths and self-referential manifest checksum", () => {
    const m = makeFixture("single-turn-arithmetic").manifest; m.files.push({ ...m.files[0], path: m.files[0].path.toUpperCase() }); expect(manifestSchema.safeParse(m).success).toBe(false);
    m.files = [{ ...m.files[0], path: "manifest.json" }]; expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("accepts BCP47 and rejects UTC offsets, numeric decimals and unknown task types", () => {
    expect(languageSchema.safeParse("es-ES").success).toBe(true); expect(languageSchema.safeParse("x-caudals").success).toBe(true); expect(languageSchema.safeParse("i-klingon").success).toBe(true); expect(languageSchema.safeParse("not_a_language").success).toBe(false);
    const c = makeFixture("single-turn-arithmetic").cases[0];
    expect(caseSchema.safeParse({ ...c, as_of: "2026-09-17T01:00:00+01:00" }).success).toBe(false);
    expect(caseSchema.safeParse({ ...c, task_type: "future_task" }).success).toBe(false);
    const grader = c.reference.graders[1]; expect(caseSchema.safeParse({ ...c, reference: { ...c.reference, graders: [{ ...grader, expected: 135.8 }] } }).success).toBe(false);
  });
  it("rejects oversized, deeply nested and invalid UTF-8 inputs with line diagnostics", () => {
    expect(() => parseJsonBytes(Buffer.from("{}"), 1)).toThrow("byte limit");
    expect(() => parseJsonBytes(Buffer.from("[".repeat(65) + "0" + "]".repeat(65)))).toThrow("nesting");
    expect(() => parseJsonBytes(new Uint8Array([0xff]))).toThrow();
    expect(() => parseJsonl(Buffer.from('{}\n\n'), caseSchema)).toThrow("line 1");
  });
});
describe("semantic references and split isolation", () => {
  it.each(["source", "anchor", "rubric", "output_schema", "observation", "assessment", "family", "duplicate"])("rejects invalid %s reference", (kind) => {
    const b = makeFixture("single-turn-arithmetic");
    if (kind === "source") b.cases[0].reference.source_refs[0].source_revision_id = "missing";
    if (kind === "anchor") b.cases[0].reference.source_refs[0].anchor = "missing";
    if (kind === "rubric") b.cases[0].reference.rubric_revision_id = "missing";
    if (kind === "output_schema") b.output_schemas = [];
    if (kind === "observation") b.observations[0].case_revision_id = "missing";
    if (kind === "assessment") b.assessments[0].observation_hash = "0".repeat(64);
    if (kind === "family") { const sibling = structuredClone(b.cases[0]); sibling.case_id = "sibling"; sibling.revision_id = "sibling-v1"; sibling.split = "training"; b.cases.push(sibling); b.cases[0].split = "holdout"; }
    if (kind === "duplicate") b.cases.push(b.cases[0]);
    expect(bundleSchema.safeParse(rehash(b)).success).toBe(false);
  });
  it("rejects dangling turns and unreachable nodes", () => {
    const c = makeFixture("multi-turn-correction").cases[0]; c.scenario.turn_plan!.nodes[0].branches[0].next_node_id = "missing";
    expect(caseSchema.safeParse(c).success).toBe(false);
  });
  it("does not grade transport errors as model failures", () => { const b = makeFixture("transport-failure"); b.assessments[0].outcome = "fail"; expect(bundleSchema.safeParse(b).success).toBe(false); });
  it("does not turn disputed ground truth into a pass", () => { const b = makeFixture("disputed-ground-truth"); b.assessments[0].outcome = "pass"; expect(bundleSchema.safeParse(b).success).toBe(false); });
  it("rejects error/status mismatch, time reversal and false unavailable usage", () => {
    const o = makeFixture("transport-failure").observations[0];
    expect(observationSchema.safeParse({ ...o, error: { category: "timeout", code: "timeout", retryable: false } }).success).toBe(false);
    expect(observationSchema.safeParse({ ...o, finished_at: "2025-01-01T00:00:00Z" }).success).toBe(false);
    expect(observationSchema.safeParse({ ...o, metadata: { ...o.metadata, cost: { value: { amount: "0", currency: "EUR" }, provenance: "unavailable" } } }).success).toBe(false);
  });
  it("requires human override reasons", () => { const a = makeFixture("single-turn-arithmetic").assessments[0]; expect(assessmentSchema.safeParse({ ...a, author: { kind: "human", id: "reviewer" }, supersedes_assessment_id: "previous", override_reason: null }).success).toBe(false); });
});
describe("audience allowlists", () => {
  it("candidate strips every private grading/provenance/extension field", () => {
    const b = makeFixture("redacted-export"); const candidate = projectCandidate(b); const text = JSON.stringify(candidate);
    expect(text).not.toContain("PRIVATE_"); expect(text).not.toContain("135.80"); expect(text).not.toContain("rubric"); expect(text).not.toContain("source_refs");
    expect(candidate.cases[0].case_revision_id).toBe(b.cases[0].revision_id); verifyContentHash(candidate);
  });
  it("exports tool definitions without expected results, transitions or state", () => { const p = projectCandidate(makeFixture("deterministic-tool-call")); expect(p.cases[0].tools).toHaveLength(1); expect(JSON.stringify(p)).not.toContain("135.80"); expect(JSON.stringify(p)).not.toContain("initial_state"); });
  it("excludes hidden holdouts unless explicitly permitted for that runner", () => { const b = makeFixture("redacted-export"); b.cases[0].split = "holdout"; rehash(b); expect(projectCandidate(b).cases).toHaveLength(0); b.manifest.visibility_policy.allow_candidate_holdout = true; rehash(b); expect(projectCandidate(b).cases).toHaveLength(1); expect(projectCustomer(b).cases).toHaveLength(0); });
  it("judge gets answer evidence but no derivation notes, author IDs, raw artifacts or provider request IDs", () => { const p = projectJudge(makeFixture("redacted-export")); expect(p.cases[0].reference.expected).toEqual({ total: "135.80", currency: "EUR" }); expect(p.sources).toHaveLength(1); expect(JSON.stringify(p)).not.toContain("PRIVATE_"); verifyContentHash(p); });
  it("customer gets reference data without private grader configuration", () => { const p = projectCustomer(makeFixture("redacted-export")); expect(p.cases[0].reference.expected).toEqual({ total: "135.80", currency: "EUR" }); expect(JSON.stringify(p)).not.toContain("PRIVATE_"); expect(JSON.stringify(p)).not.toContain("graders"); verifyContentHash(p); });
  it("denies audience access and disallowed source references", () => { const b = makeFixture("redacted-export"); b.manifest.visibility_policy.cases.candidate = false; rehash(b); expect(() => projectCandidate(b)).toThrow("disabled"); b.sources[0].access.customer = false; rehash(b); expect(() => projectCustomer(b)).toThrow("not permitted"); });
  it("public release requires consent, explicit access and reusable rights", () => {
    const b = makeFixture("redacted-export"); expect(() => projectPublic(b)).toThrow("consent");
    b.manifest.visibility_policy.publication_consent_id = "consent-v1"; b.manifest.visibility_policy.cases.public = true; b.manifest.visibility_policy.sources.public = true; b.sources[0].access.public = true; rehash(b);
    const p = projectPublic(b); expect(p.publication_consent_id).toBe("consent-v1"); expect(JSON.stringify(p)).not.toContain("PRIVATE_"); verifyContentHash(p);
    b.cases[0].provenance.rights = "customer_owned"; rehash(b); expect(() => projectPublic(b)).toThrow("rights");
  });
  it("returns independent copies and leaves frozen source input unchanged", () => { const b = makeFixture("redacted-export"); const before = canonicalJson(b); const p = projectCandidate(b); p.cases[0].messages[0].content = "modified"; expect(canonicalJson(b)).toBe(before); });
});
describe("schema export and adapter contracts", () => {
  it("exports draft 2020-12 strict schema documents deterministically", () => { const schemas = exportJsonSchemas(); expect(Object.keys(schemas)).toHaveLength(17); for (const schema of Object.values(schemas)) { expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema"); expect(schema.$id).toContain("/cef/1.0/"); } expect(schemas.case.additionalProperties).toBe(false); expect(schemas.manifest.properties?.schema_version).toMatchObject({ const: "1.0" }); expect(exportJsonSchemas()).toEqual(schemas); });
  it("requires every capability to be explicitly known or unknown", () => { const report = { checked_at: "2026-09-17T00:00:00Z", features: capabilitySchema.options.map((capability) => ({ capability, status: "unknown", evidence_artifact_id: null })) }; expect(capabilityReportSchema.safeParse(report).success).toBe(true); report.features.pop(); expect(capabilityReportSchema.safeParse(report).success).toBe(false); });
  it("rejects raw credentials, query secrets and executable mapping syntax", () => {
    const config = { schema_version: "1.0", target_revision_id: "target-v1", limits: makeFixture("single-turn-arithmetic").cases[0].limits, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session", kind: "openai_compatible", endpoint: "https://example.test/v1/chat", model: "test-model", credential: { kind: "none" } };
    expect(targetConfigSchema.safeParse(config).success).toBe(true); expect(targetConfigSchema.safeParse({ ...config, endpoint: "https://example.test/?key=secret" }).success).toBe(false); expect(targetConfigSchema.safeParse({ ...config, api_key: "secret" }).success).toBe(false);
  });
});

describe("CEF file boundary", () => {
  const files = () => { const b = makeFixture("single-turn-arithmetic"); return encodeCefFiles(b, new Map([[b.sources[0].artifact.path, Buffer.from(b.sources[0].anchors[0].excerpt)]]), "Synthetic policy"); };
  it("rejects corrupt bytes before parsing body records", () => { const f = files(); f.set("cases.jsonl", Buffer.from("malformed")); expect(() => decodeCefFiles(f)).toThrow("checksum"); });
  it("rejects unlisted files and missing manifest", () => { const f = files(); f.set("extra.txt", Buffer.from("x")); expect(() => decodeCefFiles(f)).toThrow("inventory"); f.delete("manifest.json"); expect(() => decodeCefFiles(f)).toThrow("Missing"); });
  it("rejects safe-path bypasses and reserved artifact collisions", () => { const b = makeFixture("single-turn-arithmetic"); expect(() => encodeCefFiles(b, new Map([["cases.jsonl", Buffer.from("x")]]), "scope")).toThrow("reserved"); const f = files(); f.set("../outside.txt", Buffer.from("x")); expect(() => decodeCefFiles(f)).toThrow(); });
});

describe("revision history and ambiguous JSON", () => {
  it("rejects duplicate keys, including escaped spelling", () => {
    expect(() => parseJsonBytes(Buffer.from('{"schema_version":"2.0","schema_version":"1.0"}'))).toThrow("Duplicate");
    expect(() => parseJsonBytes(Buffer.from('{"a":1,"\\u0061":2}'))).toThrow("Duplicate");
    expect(parseJsonBytes(Buffer.from('{"a":{"x":1},"b":{"x":2}}'))).toEqual({ a: { x: 1 }, b: { x: 2 } });
  });
  it("requires material edits to receive a new revision ID", () => {
    const old = makeFixture("single-turn-arithmetic").cases[0];
    expect(() => assertImmutableRevision(old, withContentHash({ ...old, title: "changed" }))).toThrow("new revision ID");
    expect(() => assertImmutableRevision(old, withContentHash({ ...old, revision_id: "v2", title: "changed" }))).not.toThrow();
  });
  it("checks family isolation against prior training releases", () => {
    const a = makeFixture("single-turn-arithmetic"); const b = makeFixture("single-turn-arithmetic");
    a.cases[0].split = "training"; b.cases[0].split = "holdout"; rehash(a); rehash(b);
    expect(() => validateFamilySplits([a.manifest, b.manifest])).toThrow("across releases");
    expect(() => validateFamilySplits([a.manifest, a.manifest])).not.toThrow();
  });
});

describe("checked-in redacted exports", () => {
  it.each([
    ["candidate", candidateProjectionSchema], ["customer", customerProjectionSchema],
    ["judge", judgeProjectionSchema], ["public", publicProjectionSchema],
  ] as const)("validates the %s projection fixture and digest", (audience, schema) => {
    const text = readFileSync(resolve("tests/evals/fixtures", `redacted-export.${audience}.json`), "utf8");
    const value = schema.parse(JSON.parse(text)); verifyContentHash(value);
    expect(text).not.toContain("PRIVATE_"); expect(value.audience).toBe(audience);
  });
});
