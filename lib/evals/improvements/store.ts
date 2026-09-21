import "server-only";

import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { idempotent } from "../repositories/identity";
import { withTenant, type TenantContext } from "../repositories/db";
import { deletePrivateObject, objectKey, readVerified, sealObject } from "../storage/private";
import { datasetItemSchema, type DatasetItem } from "./contracts";
import { buildSignedDatasetArtifact, validateReleaseCandidates, verifyDatasetArtifact } from "./release";
import { compareImprovementRuns, improvementOutcomeSchema, type OutcomeByCase } from "./validation";

type Scope = TenantContext;
export type DatasetArtifactStore = {
  seal(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  read(key: string, expectedBytes: number, expectedHash: string): Promise<Buffer>;
  delete?(key: string): Promise<void>;
};
const defaultArtifacts: DatasetArtifactStore = {
  seal: (key, bytes, mediaType) => sealObject(key, Buffer.from(bytes), mediaType),
  read: readVerified,
  delete: deletePrivateObject,
};

function denied(message = "Improvement record was not found."): never { throw new EvalError("SCOPE_DENIED", 404, message); }
function invalid(code: string, message: string): never { throw new EvalError(code, 409, message); }
function creationKey(key?: string) { return key ?? randomUUID(); }

const batchInputSchema = z.strictObject({
  projectId: z.uuid(), title: z.string().trim().min(1).max(200), objective: z.string().trim().max(12_000),
});
export async function createImprovementBatch(scope: Scope, rawInput: z.input<typeof batchInputSchema>, key?: string) {
  const input = batchInputSchema.parse(rawInput);
  return withTenant(scope, (db) => idempotent(db, scope.actorId, `improvement-batches/${scope.orgId}`, creationKey(key), input, async () => {
    const row = (await db.query(
      `INSERT INTO evals.improvement_batch(org_id,project_id,title,objective)
       SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM evals.project WHERE org_id=$1 AND id=$2)
       RETURNING id,project_id,title,objective,status,lock_version`,
      [scope.orgId, input.projectId, input.title, input.objective],
    )).rows[0];
    if (!row) denied("Project was not found.");
    return row;
  }));
}

const taskInputSchema = z.strictObject({
  findingId: z.uuid(), expertAssignmentId: z.uuid(),
  kind: z.enum(["grounded_qa", "corrected_response", "preference_pair", "retrieval_content"]),
  familyId: z.string().trim().min(1).max(200),
  split: z.enum(["development", "training", "validation", "holdout"]),
  rightsBasis: z.enum(["caudals_owned_synthetic", "caudals_owned", "customer_owned", "licensed", "public_domain"]),
});
export async function createImprovementTask(scope: Scope, batchId: string, rawInput: z.input<typeof taskInputSchema>, key?: string) {
  z.uuid().parse(batchId); const input = taskInputSchema.parse(rawInput);
  return withTenant(scope, (db) => idempotent(db, scope.actorId, `improvement-tasks/${scope.orgId}/${batchId}`, creationKey(key), input, async () => {
    try {
      const row = (await db.query(
        `INSERT INTO evals.improvement_task(
          org_id,batch_id,finding_id,expert_assignment_id,kind,family_id,split,rights_basis,status
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'assigned')
        RETURNING id,batch_id,finding_id,expert_assignment_id,kind,family_id,split,rights_basis,status`,
        [scope.orgId, batchId, input.findingId, input.expertAssignmentId, input.kind,
          input.familyId, input.split, input.rightsBasis],
      )).rows[0];
      if (!row) denied(); return row;
    } catch (error) {
      if ((error as Error).message.includes("invalid_improvement_task_lineage")) invalid("LINEAGE_INVALID", "Finding, assignment and batch must belong to one project.");
      throw error;
    }
  }));
}

function textAnswer(value: unknown) { return typeof value === "string" ? value : canonicalJson(value); }
function candidatePayload(kind: string, finding: { title: string; observation: string }, evidence: {
  transcript?: Array<{ role?: string; content?: string }>;
}, submission: { answer: unknown; rationale: string; source_refs: Array<{ source_revision_id: string; anchor: string }> }) {
  const messages = (evidence.transcript ?? []).filter((turn) =>
    ["system", "user", "assistant", "tool"].includes(turn.role ?? "") && typeof turn.content === "string",
  ).map((turn) => ({ role: turn.role as "system" | "user" | "assistant" | "tool", content: turn.content! }));
  const input = { messages: messages.length ? messages : [{ role: "user" as const, content: finding.observation }] };
  const rejected = [...messages].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
  const question = [...messages].reverse().find((turn) => turn.role === "user")?.content ?? finding.title;
  const answer = textAnswer(submission.answer);
  if (kind === "grounded_qa") return { question, answer, source_refs: submission.source_refs };
  if (kind === "corrected_response") return { input, rejected_response: rejected, corrected_response: answer, rationale: submission.rationale };
  if (kind === "preference_pair") return { input, chosen: answer, rejected, rationale: submission.rationale };
  return { title: finding.title, body: answer, source_refs: submission.source_refs };
}

export async function promoteApprovedSubmission(scope: Scope, taskId: string, submissionRevisionId: string, key?: string) {
  z.uuid().parse(taskId); z.uuid().parse(submissionRevisionId);
  const payloadKey = { taskId, submissionRevisionId };
  return withTenant(scope, (db) => idempotent(db, scope.actorId, `dataset-promotions/${scope.orgId}/${taskId}`, creationKey(key), payloadKey, async () => {
    const existing = (await db.query(
      `SELECT r.id AS revision_id,i.id AS item_id,t.status FROM evals.dataset_item_revision r
       JOIN evals.dataset_item i ON (i.org_id,i.id)=(r.org_id,r.item_id)
       JOIN evals.improvement_task t ON (t.org_id,t.id)=(r.org_id,r.task_id)
       WHERE r.org_id=$1 AND r.task_id=$2 AND r.submission_revision_id=$3
       ORDER BY r.created_at DESC LIMIT 1`, [scope.orgId, taskId, submissionRevisionId],
    )).rows[0];
    if (existing) return { itemId: existing.item_id, revisionId: existing.revision_id, status: "draft" as const };
    const row = (await db.query<{
      batch_id: string; kind: DatasetItem["kind"]; family_id: string; split: DatasetItem["split"];
      rights_basis: DatasetItem["rights_basis"]; finding_id: string; title: string; observation: string;
      expert_assignment_id: string; evidence: { transcript?: Array<{ role?: string; content?: string }> };
      author_profile_id: string; document: { answer: unknown; rationale: string; source_refs: Array<{ source_revision_id: string; anchor: string }> };
    }>(
      `SELECT t.batch_id,t.kind,t.family_id,t.split,t.rights_basis,t.finding_id,f.title,f.observation,
        t.expert_assignment_id,e.snapshot AS evidence,s.author_profile_id,s.document
       FROM evals.improvement_task t
       JOIN evals.finding f ON (f.org_id,f.id)=(t.org_id,t.finding_id)
       JOIN evals.expert_assignment_evidence e ON (e.org_id,e.assignment_id)=(t.org_id,t.expert_assignment_id)
       JOIN evals.expert_submission_revision s ON s.org_id=t.org_id AND s.id=$3
         AND s.assignment_id=t.expert_assignment_id AND s.status='submitted'
       WHERE t.org_id=$1 AND t.id=$2
         AND EXISTS(SELECT 1 FROM evals.expert_quality_review q
           WHERE q.org_id=t.org_id AND q.submission_revision_id=s.id AND q.decision='approve'
             AND q.reviewer_profile_id<>s.author_profile_id)
       FOR UPDATE OF t`, [scope.orgId, taskId, submissionRevisionId],
    )).rows[0];
    if (!row) invalid("REVIEW_REQUIRED", "Only an independently approved submission can be promoted.");
    const itemId = randomUUID(); const revisionId = randomUUID();
    const document = datasetItemSchema.parse(withContentHash({
      schema_version: "1.0", item_id: itemId, revision_id: revisionId, kind: row.kind,
      family_id: row.family_id, split: row.split, finding_id: row.finding_id,
      improvement_task_id: taskId, submission_revision_id: submissionRevisionId,
      author_profile_id: row.author_profile_id, reviewer_profile_id: null, status: "draft",
      rights_basis: row.rights_basis, rights_status: "pending", redaction_status: "pending",
      created_at: new Date().toISOString(),
      payload: candidatePayload(row.kind, row, row.evidence, row.document),
    }));
    await db.query(`INSERT INTO evals.dataset_item(id,org_id,batch_id,task_id,kind,family_id,split)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [itemId, scope.orgId, row.batch_id, taskId, row.kind, row.family_id, row.split]);
    await db.query(`INSERT INTO evals.dataset_item_revision(
      id,org_id,item_id,task_id,finding_id,submission_revision_id,author_profile_id,content_hash,document
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [revisionId, scope.orgId, itemId, taskId, row.finding_id,
      submissionRevisionId, row.author_profile_id, document.content_hash, document]);
    await db.query("UPDATE evals.improvement_task SET status='submitted',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, taskId]);
    return { itemId, revisionId, status: "draft" as const };
  }));
}

const reviewInputSchema = z.strictObject({
  reviewerProfileId: z.uuid(), decision: z.enum(["approve", "reject", "changes_requested"]),
  rightsStatus: z.enum(["pending", "permitted", "restricted"]),
  redactionStatus: z.enum(["pending", "approved", "rejected"]),
  rationale: z.string().trim().min(1).max(12_000),
});
export async function reviewDatasetItem(scope: Scope, itemRevisionId: string, rawInput: z.input<typeof reviewInputSchema>, key?: string) {
  z.uuid().parse(itemRevisionId); const input = reviewInputSchema.parse(rawInput);
  return withTenant(scope, (db) => idempotent(db, scope.actorId, `dataset-reviews/${scope.orgId}/${itemRevisionId}`, creationKey(key), input, async () => {
    const reviewer = (await db.query("SELECT id FROM evals.expert_profile WHERE id=$1 AND credentials_status='verified' AND terms_status='accepted'", [input.reviewerProfileId])).rows[0];
    if (!reviewer) invalid("REVIEWER_INELIGIBLE", "Choose a verified reviewer with accepted terms.");
    try {
      const result = (await db.query<{ id: string; task_id: string }>(
        `WITH inserted AS (
          INSERT INTO evals.dataset_item_review(org_id,item_revision_id,reviewer_profile_id,decision,rights_status,redaction_status,rationale)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,item_revision_id
        ) SELECT inserted.id,r.task_id FROM inserted JOIN evals.dataset_item_revision r
          ON (r.org_id,r.id)=($1,inserted.item_revision_id)`,
        [scope.orgId, itemRevisionId, input.reviewerProfileId, input.decision, input.rightsStatus, input.redactionStatus, input.rationale],
      )).rows[0];
      if (!result) denied();
      const approved = input.decision === "approve" && input.rightsStatus === "permitted" && input.redactionStatus === "approved";
      await db.query("UPDATE evals.improvement_task SET status=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, result.task_id, approved ? "approved" : input.decision === "reject" ? "rejected" : "submitted"]);
      return { id: result.id, status: approved ? "approved" : input.decision };
    } catch (error) {
      if ((error as Error).message.includes("independent_review_required")) invalid("INDEPENDENT_REVIEW_REQUIRED", "Dataset QA requires a different reviewer.");
      throw error;
    }
  }));
}

function approvedDocument(row: {
  document: unknown; reviewer_profile_id: string; rights_status: string; redaction_status: string;
}) {
  const draft = datasetItemSchema.parse(row.document);
  const { content_hash: _oldHash, ...content } = draft;
  void _oldHash;
  return datasetItemSchema.parse(withContentHash({ ...content, reviewer_profile_id: row.reviewer_profile_id,
    status: "approved", rights_status: row.rights_status, redaction_status: row.redaction_status }));
}

export async function releaseDataset(
  scope: Scope, batchId: string, privateKey: string, artifacts: DatasetArtifactStore = defaultArtifacts,
  options: { key?: string; expectedVersion?: number } = {},
) {
  z.uuid().parse(batchId); let sealedKey: string | null = null;
  try {
    const result = await withTenant(scope, (db) => idempotent(db, scope.actorId, `dataset-release/${scope.orgId}/${batchId}`, creationKey(options.key), { batchId, expectedVersion: options.expectedVersion }, async () => {
      const batch = (await db.query<{ project_id: string; lock_version: number }>(
        "SELECT project_id,lock_version FROM evals.improvement_batch WHERE org_id=$1 AND id=$2 FOR UPDATE",
        [scope.orgId, batchId],
      )).rows[0];
      if (!batch) denied();
      if (options.expectedVersion !== undefined && batch.lock_version !== options.expectedVersion) invalid("VERSION_CONFLICT", "The improvement batch changed.");
      const rows = (await db.query<{
        revision_id: string; document: unknown; reviewer_profile_id: string | null; decision: string | null;
        rights_status: string | null; redaction_status: string | null;
      }>(
        `SELECT r.id AS revision_id,r.document,review.reviewer_profile_id,review.decision,
          review.rights_status,review.redaction_status
         FROM evals.dataset_item i
         JOIN LATERAL (SELECT * FROM evals.dataset_item_revision candidate
           WHERE (candidate.org_id,candidate.item_id)=(i.org_id,i.id)
           ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1) r ON true
         LEFT JOIN evals.dataset_item_review review ON (review.org_id,review.item_revision_id)=(r.org_id,r.id)
         WHERE i.org_id=$1 AND i.batch_id=$2 ORDER BY i.created_at,i.id`, [scope.orgId, batchId],
      )).rows;
      if (!rows.length) invalid("RELEASE_EMPTY", "Add at least one reviewed item before release.");
      if (rows.some((row) => !row.reviewer_profile_id || row.decision !== "approve" || row.rights_status !== "permitted" || row.redaction_status !== "approved")) {
        invalid("REVIEW_REQUIRED", "review_required: every released item requires independent approval, permitted rights and approved redaction.");
      }
      const items = rows.map((row) => approvedDocument(row as Parameters<typeof approvedDocument>[0]));
      const heldOutFamilies = (await db.query<{ family_id: string }>(
        `SELECT DISTINCT cr.family_id FROM evals.case_revision cr JOIN evals."case" c
          ON (c.org_id,c.id)=(cr.org_id,cr.case_id)
         WHERE cr.org_id=$1 AND c.project_id=$2 AND cr.split='holdout'`, [scope.orgId, batch.project_id],
      )).rows.map((row) => row.family_id);
      const priorReleases = (await db.query<{ family_id: string; split: DatasetItem["split"] }>(
        `SELECT i.family_id,i.split FROM evals.dataset_release_item ri
         JOIN evals.dataset_release rel ON (rel.org_id,rel.id)=(ri.org_id,ri.release_id)
         JOIN evals.dataset_item_revision r ON (r.org_id,r.id)=(ri.org_id,ri.item_revision_id)
         JOIN evals.dataset_item i ON (i.org_id,i.id)=(r.org_id,r.item_id)
         WHERE rel.org_id=$1 AND rel.project_id=$2 AND rel.status='ready'`, [scope.orgId, batch.project_id],
      )).rows;
      validateReleaseCandidates({ items, heldOutFamilies, priorReleases });
      const descriptorKey = canonicalJson(items.map((item) => ({ revision_id: item.revision_id, content_hash: item.content_hash })));
      const old = (await db.query<{
        release_id: string; artifact_id: string; content_hash: string; manifest: { items?: Array<{ revision_id?: string; content_hash?: string }> };
        sha256: string; byte_size: number; public_key_fingerprint: string;
      }>(
        `SELECT rel.id AS release_id,rel.artifact_id,rel.content_hash,rel.manifest,a.sha256,a.byte_size,rel.public_key_fingerprint
         FROM evals.dataset_release rel JOIN evals.artifact a ON (a.org_id,a.id)=(rel.org_id,rel.artifact_id)
         WHERE rel.org_id=$1 AND rel.batch_id=$2 AND rel.status='ready'
         ORDER BY rel.revision DESC LIMIT 1`, [scope.orgId, batchId],
      )).rows[0];
      if (old && canonicalJson((old.manifest.items ?? []).map((item) => ({ revision_id: item.revision_id, content_hash: item.content_hash }))) === descriptorKey) {
        return { releaseId: old.release_id, artifactId: old.artifact_id, contentHash: old.content_hash,
          sha256: old.sha256, byteSize: old.byte_size, publicKeyFingerprint: old.public_key_fingerprint };
      }
      const releaseId = randomUUID(); const artifactId = randomUUID(); const createdAt = new Date().toISOString();
      const bytes = buildSignedDatasetArtifact({ manifestInput: { release_id: releaseId, batch_id: batchId,
        project_id: batch.project_id, created_at: createdAt }, items, privateKey, heldOutFamilies, priorReleases });
      const verified = verifyDatasetArtifact(bytes, createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString());
      const byteHash = sha256(bytes); const key = objectKey(scope.orgId, artifactId, true);
      await artifacts.seal(key, bytes, "application/x-ndjson"); sealedKey = key;
      const revision = Number((await db.query<{ revision: number }>(
        "SELECT COALESCE(max(revision),0)::int+1 AS revision FROM evals.dataset_release WHERE org_id=$1 AND batch_id=$2",
        [scope.orgId, batchId],
      )).rows[0]?.revision ?? 1);
      await db.query(`INSERT INTO evals.artifact(
        id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state,expires_at
      ) VALUES($1,$2,$3,$4,'customer',$5,$6,$7,'application/x-ndjson','ready',now()+interval '10 years')`,
      [artifactId, scope.orgId, batch.project_id, `dataset-releases/${releaseId}.jsonl`, key, byteHash, bytes.byteLength]);
      await db.query(`INSERT INTO evals.dataset_release(
        id,org_id,batch_id,project_id,revision,content_hash,manifest,artifact_id,public_key_fingerprint,status
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready')`, [releaseId, scope.orgId, batchId, batch.project_id,
        revision, verified.manifest.content_hash, verified.manifest, artifactId, verified.manifest.public_key_fingerprint]);
      for (const [ordinal, row] of rows.entries()) await db.query(
        "INSERT INTO evals.dataset_release_item(org_id,release_id,item_revision_id,ordinal) VALUES($1,$2,$3,$4)",
        [scope.orgId, releaseId, row.revision_id, ordinal],
      );
      await db.query("UPDATE evals.improvement_batch SET status='released',lock_version=lock_version+1,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, batchId]);
      return { releaseId, artifactId, contentHash: verified.manifest.content_hash, sha256: byteHash,
        byteSize: bytes.byteLength, publicKeyFingerprint: verified.manifest.public_key_fingerprint };
    }));
    sealedKey = null;
    return result;
  } catch (error) {
    if (sealedKey && artifacts.delete) await artifacts.delete(sealedKey).catch(() => undefined);
    throw error;
  }
}

export async function getDatasetArtifact(scope: Scope, artifactId: string, artifacts: DatasetArtifactStore = defaultArtifacts) {
  z.uuid().parse(artifactId);
  const row = await withTenant(scope, async (db) => (await db.query<{
    object_key: string; byte_size: number; sha256: string; release_id: string;
  }>(
    `SELECT a.object_key,a.byte_size,a.sha256,rel.id AS release_id FROM evals.dataset_release rel
     JOIN evals.artifact a ON (a.org_id,a.id)=(rel.org_id,rel.artifact_id)
     WHERE rel.org_id=$1 AND a.id=$2 AND rel.status='ready' AND a.state='ready'`, [scope.orgId, artifactId],
  )).rows[0]);
  if (!row) denied("Dataset artifact was not found.");
  return { bytes: await artifacts.read(row.object_key, row.byte_size, row.sha256), fileName: `caudals-dataset-${row.release_id}.jsonl`,
    mediaType: "application/x-ndjson", sha256: row.sha256 };
}

export function datasetSigningKey() {
  const value = getSecretEnvValue("EVALS_DATASET_SIGNING_KEY", { missingMessage: "Dataset signing key is not configured" });
  if (!value) throw new Error("Dataset signing key is not configured");
  if (createPrivateKey(value).asymmetricKeyType !== "ed25519") throw new Error("Dataset signing key must be Ed25519");
  return value;
}

export async function listImprovementBatches(scope: Scope) {
  return withTenant(scope, async (db) => (await db.query(
    `SELECT b.id,b.project_id,b.title,b.objective,b.status,b.lock_version,b.updated_at,
      count(DISTINCT t.id)::int AS task_count,count(DISTINCT i.id)::int AS item_count
     FROM evals.improvement_batch b LEFT JOIN evals.improvement_task t ON (t.org_id,t.batch_id)=(b.org_id,b.id)
     LEFT JOIN evals.dataset_item i ON (i.org_id,i.batch_id)=(b.org_id,b.id)
     WHERE b.org_id=$1 GROUP BY b.id ORDER BY b.updated_at DESC,b.id LIMIT 100`, [scope.orgId],
  )).rows);
}

export async function getImprovementBatch(scope: Scope, batchId: string) {
  z.uuid().parse(batchId);
  return withTenant(scope, async (db) => {
    const batch = (await db.query("SELECT * FROM evals.improvement_batch WHERE org_id=$1 AND id=$2", [scope.orgId, batchId])).rows[0];
    if (!batch) denied();
    const tasks = (await db.query("SELECT * FROM evals.improvement_task WHERE org_id=$1 AND batch_id=$2 ORDER BY created_at,id", [scope.orgId, batchId])).rows;
    const items = (await db.query(`SELECT i.*,r.id AS revision_id,r.document,review.decision,review.rights_status,review.redaction_status
      FROM evals.dataset_item i LEFT JOIN LATERAL (SELECT * FROM evals.dataset_item_revision candidate WHERE (candidate.org_id,candidate.item_id)=(i.org_id,i.id) ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1) r ON true
      LEFT JOIN evals.dataset_item_review review ON (review.org_id,review.item_revision_id)=(r.org_id,r.id)
      WHERE i.org_id=$1 AND i.batch_id=$2 ORDER BY i.created_at,i.id`, [scope.orgId, batchId])).rows;
    const releases = (await db.query("SELECT id,revision,status,artifact_id,content_hash,public_key_fingerprint,created_at FROM evals.dataset_release WHERE org_id=$1 AND batch_id=$2 ORDER BY revision DESC", [scope.orgId, batchId])).rows;
    return { batch, tasks, items, releases };
  });
}

const validationInputSchema = z.strictObject({
  releaseId: z.uuid(), baselineRunId: z.uuid(), followupRunId: z.uuid(), comparisonId: z.uuid(),
  description: z.string().trim().min(1).max(12_000), evidenceReference: z.string().trim().min(1).max(2_000),
  expectedVersion: z.int().nonnegative().optional(),
});
export async function recordInterventionValidation(scope: Scope, batchId: string, rawInput: z.input<typeof validationInputSchema>, key?: string) {
  z.uuid().parse(batchId); const input = validationInputSchema.parse(rawInput);
  return withTenant(scope, (db) => idempotent(db, scope.actorId, `improvement-validation/${scope.orgId}/${batchId}`, creationKey(key), input, async () => {
    const batch = (await db.query<{ project_id: string; lock_version: number }>("SELECT project_id,lock_version FROM evals.improvement_batch WHERE org_id=$1 AND id=$2 FOR UPDATE", [scope.orgId, batchId])).rows[0];
    if (!batch) denied();
    if (input.expectedVersion !== undefined && input.expectedVersion !== batch.lock_version) invalid("VERSION_CONFLICT", "The improvement batch changed.");
    const comparison = (await db.query<{ status: string }>(`SELECT status FROM evals.comparison WHERE org_id=$1 AND id=$2 AND project_id=$3 AND baseline_run_id=$4 AND candidate_run_id=$5`,
      [scope.orgId, input.comparisonId, batch.project_id, input.baselineRunId, input.followupRunId])).rows[0];
    if (!comparison || comparison.status !== "compatible") invalid("COMPARISON_INCOMPATIBLE", "Follow-up validation requires a compatible comparison.");
    const release = (await db.query("SELECT id FROM evals.dataset_release WHERE org_id=$1 AND id=$2 AND batch_id=$3 AND status='ready'", [scope.orgId, input.releaseId, batchId])).rows[0];
    if (!release) denied("Released dataset was not found.");
    async function outcomes(runId: string) {
      const rows = (await db.query<{ revision_id: string; family_id: string; split: string; outcome: string | null }>(
        `SELECT cu.case_revision_id::text AS revision_id,cr.family_id,cr.split,assessment.outcome
         FROM evals.case_unit cu JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id)
         LEFT JOIN evals.observation o ON (o.org_id,o.case_unit_id)=(cu.org_id,cu.id)
         LEFT JOIN LATERAL (SELECT a.outcome FROM evals.assessment a WHERE (a.org_id,a.observation_id)=(o.org_id,o.id)
           ORDER BY a.created_at DESC,a.id DESC LIMIT 1) assessment ON true
         WHERE cu.org_id=$1 AND cu.run_id=$2`, [scope.orgId, runId],
      )).rows;
      return rows;
    }
    const baselineRows = await outcomes(input.baselineRunId); const followupRows = await outcomes(input.followupRunId);
    const followupIds = new Set(followupRows.map((row) => row.revision_id));
    const cases = baselineRows.filter((row) => followupIds.has(row.revision_id) && ["training", "validation", "holdout"].includes(row.split))
      .map((row) => ({ revisionId: row.revision_id, familyId: row.family_id, split: row.split as "training" | "validation" | "holdout" }));
    const toOutcomes = (rows: typeof baselineRows) => Object.fromEntries(rows.filter((row) => row.outcome).map((row) => [row.revision_id, improvementOutcomeSchema.parse(row.outcome)])) as OutcomeByCase;
    const snapshot = compareImprovementRuns({ baseline: toOutcomes(baselineRows), followup: toOutcomes(followupRows), cases });
    const intervention = (await db.query(`INSERT INTO evals.intervention_record(org_id,project_id,release_id,baseline_run_id,description,evidence_reference)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [scope.orgId, batch.project_id, input.releaseId, input.baselineRunId, input.description, input.evidenceReference])).rows[0];
    const validation = (await db.query(`INSERT INTO evals.intervention_validation(org_id,intervention_id,followup_run_id,comparison_id,snapshot)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [scope.orgId, intervention.id, input.followupRunId, input.comparisonId, snapshot])).rows[0];
    return { interventionId: intervention.id, validationId: validation.id, snapshot };
  }));
}
