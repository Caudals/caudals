import { z } from "zod";
import { type CefBundle, DEFAULT_PARSE_LIMITS, parseBundle, parseJsonBytes, parseJsonl, serializeJsonl, verifyBundleFiles } from "./bundle";
import { caseSchema, rubricSchema, sourceSchema } from "./cases";
import { canonicalJson, sha256, verifyContentHash, verifyFile, withContentHash } from "./hashing";
import { manifestSchema } from "./manifest";
import { assessmentSchema, observationSchema } from "./results";
import { hashSchema, idSchema, safePathSchema } from "./primitives";
import { jsonSchemaDocumentSchema, toolFixtureSchema } from "./scenarios";

const outputSchema = z.strictObject({ id: idSchema, content_hash: hashSchema, schema: jsonSchemaDocumentSchema });
const reservedPaths = ["manifest.json", "cases.jsonl", "sources.jsonl", "rubrics.jsonl", "observations.jsonl", "assessments.jsonl", "output-schemas.jsonl", "fixtures/tool-fixtures.jsonl", "README.md"];
const MAX_FILES = 10000;
const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;

/** A byte-map boundary, deliberately not a ZIP extractor or filesystem writer. */
export function encodeCefFiles(input: unknown, artifacts: ReadonlyMap<string, Uint8Array>, readme: string): Map<string, Uint8Array> {
  const b = parseBundle(input);
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of artifacts) { safePathSchema.parse(path); if (reservedPaths.some((reserved) => reserved.toLowerCase() === path.toLowerCase())) throw new Error("Artifact collides with reserved CEF path"); files.set(path, new Uint8Array(bytes)); }
  for (const [path, records] of [
    ["cases.jsonl", b.cases], ["sources.jsonl", b.sources], ["rubrics.jsonl", b.rubrics],
    ["observations.jsonl", b.observations], ["assessments.jsonl", b.assessments],
    ["output-schemas.jsonl", b.output_schemas], ["fixtures/tool-fixtures.jsonl", b.fixtures],
  ] as const) files.set(path, Buffer.from(serializeJsonl(records)));
  files.set("README.md", Buffer.from(readme));
  const manifest = withContentHash({ ...b.manifest, files: [...files].sort(([a], [c]) => a < c ? -1 : a > c ? 1 : 0).map(([path, bytes]) => ({ path, sha256: sha256(bytes), size_bytes: bytes.byteLength })) });
  verifyBundleFiles({ ...b, manifest }, files);
  files.set("manifest.json", Buffer.from(canonicalJson(manifest) + "\n"));
  checkFileLimits(files);
  return files;
}
function checkFileLimits(files: ReadonlyMap<string, Uint8Array>): void {
  if (files.size > MAX_FILES) throw new Error("Bundle file count limit exceeded");
  let total = 0; const paths = new Set<string>();
  for (const [path, bytes] of files) {
    safePathSchema.parse(path);
    if (paths.has(path.toLowerCase())) throw new Error("Case-colliding bundle path"); paths.add(path.toLowerCase());
    total += bytes.byteLength;
    if (bytes.byteLength > DEFAULT_PARSE_LIMITS.max_bytes || total > MAX_BUNDLE_BYTES) throw new Error("Bundle byte limit exceeded");
  }
}
export function decodeCefFiles(files: ReadonlyMap<string, Uint8Array>): CefBundle {
  checkFileLimits(files);
  const required = (path: string) => { const bytes = files.get(path); if (!bytes) throw new Error(`Missing CEF file: ${path}`); return bytes; };
  const manifest = manifestSchema.parse(parseJsonBytes(required("manifest.json"))); verifyContentHash(manifest);
  const payload = new Map(files); payload.delete("manifest.json");
  if (payload.size !== manifest.files.length) throw new Error("File inventory mismatch");
  for (const file of manifest.files) verifyFile(required(file.path), file);
  // Fail before parsing any body with a corrupt or unlisted byte stream.
  const bundle = { manifest,
    cases: parseJsonl(required("cases.jsonl"), caseSchema), sources: parseJsonl(required("sources.jsonl"), sourceSchema), rubrics: parseJsonl(required("rubrics.jsonl"), rubricSchema),
    observations: files.has("observations.jsonl") ? parseJsonl(required("observations.jsonl"), observationSchema) : [],
    assessments: files.has("assessments.jsonl") ? parseJsonl(required("assessments.jsonl"), assessmentSchema) : [],
    fixtures: files.has("fixtures/tool-fixtures.jsonl") ? parseJsonl(required("fixtures/tool-fixtures.jsonl"), toolFixtureSchema) : [],
    output_schemas: files.has("output-schemas.jsonl") ? parseJsonl(required("output-schemas.jsonl"), outputSchema) : [],
  };
  new TextDecoder("utf-8", { fatal: true }).decode(required("README.md"));
  return verifyBundleFiles(bundle, payload);
}
