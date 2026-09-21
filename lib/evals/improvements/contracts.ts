import { z } from "zod";
import {
  hashSchema, idSchema, rightsSchema, schemaVersionSchema, splitSchema, timestampSchema,
} from "../contracts/primitives";

const uuid = z.uuid();
const sourceRefSchema = z.strictObject({
  source_revision_id: idSchema,
  anchor: z.string().trim().min(1).max(500),
});
export const datasetCandidateInputSchema = z.strictObject({
  messages: z.array(z.strictObject({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().max(100_000),
  })).min(1).max(500),
  context: z.array(z.string().max(100_000)).max(100).optional(),
});

const groundedQaPayloadSchema = z.strictObject({
  question: z.string().trim().min(1).max(30_000),
  answer: z.string().trim().min(1).max(50_000),
  source_refs: z.array(sourceRefSchema).min(1).max(100),
});
const correctedResponsePayloadSchema = z.strictObject({
  input: datasetCandidateInputSchema,
  rejected_response: z.string().max(100_000),
  corrected_response: z.string().trim().min(1).max(100_000),
  rationale: z.string().trim().min(1).max(12_000),
});
const preferencePairPayloadSchema = z.strictObject({
  input: datasetCandidateInputSchema,
  chosen: z.string().trim().min(1).max(100_000),
  rejected: z.string().max(100_000),
  rationale: z.string().trim().min(1).max(12_000),
});
const retrievalContentPayloadSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(200_000),
  source_refs: z.array(sourceRefSchema).min(1).max(100),
});

const itemBase = {
  schema_version: schemaVersionSchema,
  item_id: uuid,
  revision_id: uuid,
  family_id: idSchema,
  split: splitSchema,
  finding_id: uuid,
  improvement_task_id: uuid,
  submission_revision_id: uuid,
  author_profile_id: uuid,
  reviewer_profile_id: uuid.nullable(),
  status: z.enum(["draft", "approved", "rejected"]),
  rights_basis: rightsSchema,
  rights_status: z.enum(["pending", "permitted", "restricted"]),
  redaction_status: z.enum(["pending", "approved", "rejected"]),
  created_at: timestampSchema,
  content_hash: hashSchema,
};

export const datasetItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...itemBase, kind: z.literal("grounded_qa"), payload: groundedQaPayloadSchema }),
  z.strictObject({ ...itemBase, kind: z.literal("corrected_response"), payload: correctedResponsePayloadSchema }),
  z.strictObject({ ...itemBase, kind: z.literal("preference_pair"), payload: preferencePairPayloadSchema }),
  z.strictObject({ ...itemBase, kind: z.literal("retrieval_content"), payload: retrievalContentPayloadSchema }),
]);

export const datasetItemDescriptorSchema = z.strictObject({
  item_id: uuid,
  revision_id: uuid,
  kind: z.enum(["grounded_qa", "corrected_response", "preference_pair", "retrieval_content"]),
  family_id: idSchema,
  split: splitSchema,
  finding_id: uuid,
  improvement_task_id: uuid,
  submission_revision_id: uuid,
  content_hash: hashSchema,
});

export const datasetReleaseManifestSchema = z.strictObject({
  schema_version: schemaVersionSchema,
  release_id: uuid,
  batch_id: uuid,
  project_id: uuid,
  created_at: timestampSchema,
  item_count: z.int().positive().max(100_000),
  items: z.array(datasetItemDescriptorSchema).min(1).max(100_000),
  data_dictionary_hash: hashSchema,
  payload_sha256: hashSchema,
  public_key_fingerprint: hashSchema,
  signature_algorithm: z.literal("Ed25519"),
  content_hash: hashSchema,
  signature: z.string().min(80).max(200).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export const datasetDataDictionarySchema = z.strictObject({
  schema_version: schemaVersionSchema,
  record_type: z.literal("data_dictionary"),
  fields: z.array(z.strictObject({
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(2_000),
  })).min(1).max(100),
  content_hash: hashSchema,
});

export type DatasetItem = z.infer<typeof datasetItemSchema>;
export type DatasetItemDescriptor = z.infer<typeof datasetItemDescriptorSchema>;
export type DatasetReleaseManifest = z.infer<typeof datasetReleaseManifestSchema>;
export type DatasetDataDictionary = z.infer<typeof datasetDataDictionarySchema>;
