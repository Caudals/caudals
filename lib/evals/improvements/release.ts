import {
  createPrivateKey, createPublicKey, sign, verify, type KeyObject,
} from "node:crypto";
import { canonicalJson, contentHash, sha256, verifyContentHash, withContentHash } from "../contracts/hashing";
import { parseJsonBytes } from "../contracts/bundle";
import {
  datasetDataDictionarySchema, datasetItemSchema, datasetReleaseManifestSchema,
  type DatasetDataDictionary, type DatasetItem, type DatasetItemDescriptor,
  type DatasetReleaseManifest,
} from "./contracts";

const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

type PriorFamily = { family_id: string; split: DatasetItem["split"] };
export function validateReleaseCandidates(input: {
  items: readonly DatasetItem[];
  heldOutFamilies: readonly string[];
  priorReleases: readonly PriorFamily[];
}) {
  if (!input.items.length) throw new Error("release_empty");
  const heldOut = new Set(input.heldOutFamilies);
  const seenItems = new Set<string>(); const seenRevisions = new Set<string>();
  const familySplits = new Map<string, DatasetItem["split"]>();
  for (const prior of input.priorReleases) {
    const existing = familySplits.get(prior.family_id);
    if (existing && existing !== prior.split) throw new Error("family_split_overlap");
    familySplits.set(prior.family_id, prior.split);
  }
  for (const candidate of input.items) {
    if (candidate.status !== "approved") throw new Error("review_required");
    if (candidate.rights_status !== "permitted") throw new Error("rights_not_permitted");
    if (candidate.redaction_status !== "approved") throw new Error("redaction_not_approved");
    if (!candidate.reviewer_profile_id || candidate.reviewer_profile_id === candidate.author_profile_id) throw new Error("independent_review_required");
    if (seenItems.has(candidate.item_id) || seenRevisions.has(candidate.revision_id)) throw new Error("duplicate_release_item");
    seenItems.add(candidate.item_id); seenRevisions.add(candidate.revision_id);
    const existingSplit = familySplits.get(candidate.family_id);
    if ((heldOut.has(candidate.family_id) && candidate.split !== "holdout") ||
        (existingSplit && existingSplit !== candidate.split)) throw new Error("family_split_overlap");
    familySplits.set(candidate.family_id, candidate.split);
  }
  const parsed = input.items.map((candidate) => datasetItemSchema.parse(candidate));
  for (const candidate of parsed) verifyContentHash(candidate);
  return parsed;
}

function descriptor(item: DatasetItem): DatasetItemDescriptor {
  return {
    item_id: item.item_id, revision_id: item.revision_id, kind: item.kind,
    family_id: item.family_id, split: item.split, finding_id: item.finding_id,
    improvement_task_id: item.improvement_task_id,
    submission_revision_id: item.submission_revision_id,
    content_hash: item.content_hash,
  };
}

function dictionary(): DatasetDataDictionary {
  return datasetDataDictionarySchema.parse(withContentHash({
    schema_version: "1.0", record_type: "data_dictionary",
    fields: [
      { name: "kind", description: "One of grounded_qa, corrected_response, preference_pair or retrieval_content." },
      { name: "family_id", description: "Leakage-control family shared by sibling examples." },
      { name: "split", description: "Training, development, validation or untouched holdout membership." },
      { name: "finding_id", description: "Evaluation finding that motivated the improvement task." },
      { name: "submission_revision_id", description: "Immutable approved expert submission used to author the item." },
      { name: "content_hash", description: "SHA-256 of canonical item content excluding this field." },
    ],
  }));
}

function ed25519Private(pem: string): KeyObject {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("dataset_signing_key_must_be_ed25519");
  return key;
}
function ed25519Public(pem: string): KeyObject {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("dataset_public_key_must_be_ed25519");
  return key;
}
function fingerprint(key: KeyObject) {
  return sha256(key.export({ format: "der", type: "spki" }));
}

type ManifestInput = Pick<DatasetReleaseManifest, "release_id" | "batch_id" | "project_id" | "created_at">;
export function buildSignedDatasetArtifact(input: {
  manifestInput: ManifestInput;
  items: readonly DatasetItem[];
  privateKey: string;
  heldOutFamilies?: readonly string[];
  priorReleases?: readonly PriorFamily[];
}): Uint8Array {
  const items = validateReleaseCandidates({
    items: input.items,
    heldOutFamilies: input.heldOutFamilies ?? [],
    priorReleases: input.priorReleases ?? [],
  });
  const privateKey = ed25519Private(input.privateKey);
  const publicKey = createPublicKey(privateKey);
  const dataDictionary = dictionary();
  const payload = `${items.map(canonicalJson).join("\n")}\n${canonicalJson(dataDictionary)}\n`;
  const base = {
    schema_version: "1.0" as const,
    ...input.manifestInput,
    item_count: items.length,
    items: items.map(descriptor),
    data_dictionary_hash: dataDictionary.content_hash,
    payload_sha256: sha256(payload),
    public_key_fingerprint: fingerprint(publicKey),
    signature_algorithm: "Ed25519" as const,
  };
  const signed = { ...base, content_hash: contentHash(base) };
  const manifest = datasetReleaseManifestSchema.parse({
    ...signed,
    signature: sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString("base64"),
  });
  const bytes = Buffer.from(`${canonicalJson(manifest)}\n${payload}`);
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("dataset_artifact_too_large");
  return bytes;
}

export function verifyDatasetArtifact(bytesInput: Uint8Array | string, publicPem: string): {
  manifest: DatasetReleaseManifest; items: DatasetItem[]; dataDictionary: DatasetDataDictionary;
} {
  const bytes = typeof bytesInput === "string" ? Buffer.from(bytesInput) : Buffer.from(bytesInput);
  if (!bytes.length || bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("dataset_artifact_size_invalid");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error("dataset_artifact_not_canonical_jsonl");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length < 3 || lines.some((line) => !line)) throw new Error("dataset_artifact_truncated");
  const manifest = datasetReleaseManifestSchema.parse(parseJsonBytes(Buffer.from(lines[0]), MAX_ARTIFACT_BYTES));
  if (lines.length !== manifest.item_count + 2) throw new Error("dataset_item_count_mismatch");
  const items = lines.slice(1, 1 + manifest.item_count).map((line) => datasetItemSchema.parse(parseJsonBytes(Buffer.from(line), 2_000_000)));
  const dataDictionary = datasetDataDictionarySchema.parse(parseJsonBytes(Buffer.from(lines.at(-1)!), 2_000_000));
  if (lines[0] !== canonicalJson(manifest) || items.some((item, index) => lines[index + 1] !== canonicalJson(item)) ||
      lines.at(-1) !== canonicalJson(dataDictionary)) throw new Error("dataset_artifact_not_canonical_jsonl");
  items.forEach(verifyContentHash); verifyContentHash(dataDictionary);
  validateReleaseCandidates({ items, heldOutFamilies: [], priorReleases: [] });
  if (dataDictionary.content_hash !== manifest.data_dictionary_hash) throw new Error("data_dictionary_hash_mismatch");
  const descriptors = items.map(descriptor);
  if (canonicalJson(descriptors) !== canonicalJson(manifest.items)) throw new Error("dataset_item_order_mismatch");
  const payload = `${lines.slice(1).join("\n")}\n`;
  if (sha256(payload) !== manifest.payload_sha256) throw new Error("dataset_payload_hash_mismatch");
  const { signature, content_hash, ...base } = manifest;
  if (contentHash(base) !== content_hash) throw new Error("dataset_manifest_hash_mismatch");
  const signed = { ...base, content_hash };
  const publicKey = ed25519Public(publicPem);
  if (fingerprint(publicKey) !== manifest.public_key_fingerprint) throw new Error("dataset_public_key_fingerprint_mismatch");
  if (!verify(null, Buffer.from(canonicalJson(signed)), publicKey, Buffer.from(signature, "base64"))) throw new Error("dataset_signature_invalid");
  return { manifest, items, dataDictionary };
}
