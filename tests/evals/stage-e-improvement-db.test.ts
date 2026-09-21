import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import {
  createImprovementBatch, createImprovementTask, getDatasetArtifact,
  promoteApprovedSubmission, releaseDataset, reviewDatasetItem,
  type DatasetArtifactStore,
} from "../../lib/evals/improvements/store";
import { verifyDatasetArtifact } from "../../lib/evals/improvements/release";

const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const hash = "a".repeat(64);

(runtimeUrl && ownerUrl ? describe : describe.skip)("WP-15 improvement lineage PostgreSQL path", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const operator = `operator-${randomUUID()}`;
  const expertA = `expert-a-${randomUUID()}`;
  const expertB = `expert-b-${randomUUID()}`;
  const orgA = randomUUID(); const orgB = randomUUID();
  const projectA = randomUUID(); const projectB = randomUUID();
  const profileA = randomUUID(); const profileB = randomUUID();
  const submission = randomUUID(); const assignment = randomUUID(); const reviewAssignment = randomUUID(); const guideline = randomUUID();
  const finding = randomUUID(); const baselineRun = randomUUID(); const followupRun = randomUUID(); const comparison = randomUUID();

  beforeAll(async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      for (const id of [operator, expertA, expertB]) await db.query(
        `INSERT INTO public.auth_user(id,name,email,"emailVerified","createdAt","updatedAt")
         VALUES($1,$1,$2,true,now(),now())`, [id, `${randomUUID()}@example.test`],
      );
      await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [operator]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'A',$3),($2,'B',$3)", [orgA, orgB, operator]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$3,'operator'),($2,$3,'operator')", [orgA, orgB, operator]);
      await db.query("INSERT INTO evals.project(id,org_id,title,created_by) VALUES($1,$2,'A',$5),($3,$4,'B',$5)", [projectA, orgA, projectB, orgB, operator]);
      const target = randomUUID(); const targetRevision = randomUUID(); const suite = randomUUID(); const suiteVersion = randomUUID(); const evaluation = randomUUID();
      const rubric = randomUUID(); const caseId = randomUUID(); const caseRevision = randomUUID();
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title,created_by) VALUES($1,$2,$3,'Target',$4)", [target, orgA, projectA, operator]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document,created_by) VALUES($1,$2,$3,$4,'{}',$5)", [targetRevision, orgA, target, hash, operator]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document,created_by) VALUES($1,$2,$3,$4,'{}',$5)", [rubric, orgA, projectA, hash, operator]);
      await db.query("INSERT INTO evals.\"case\"(id,org_id,project_id,created_by) VALUES($1,$2,$3,$4)", [caseId, orgA, projectA, operator]);
      await db.query(`INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id,created_by)
        VALUES($1,$2,$3,'run-family','holdout',$4,'{}',$5,$6)`, [caseRevision, orgA, caseId, hash, rubric, operator]);
      await db.query("INSERT INTO evals.suite(id,org_id,project_id,title,created_by) VALUES($1,$2,$3,'Suite',$4)", [suite, orgA, projectA, operator]);
      const manifest = { suite_id: suite, suite_version_id: suiteVersion, content_hash: hash,
        case_revisions: [{ revision_id: caseRevision, case_id: caseId, content_hash: hash, family_id: "run-family", split: "holdout" }],
        source_revisions: [], rubric_revisions: [], output_schema_revisions: [], fixture_revisions: [], files: [] };
      await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest,created_by) VALUES($1,$2,$3,$4,$5,$6)", [suiteVersion, orgA, suite, hash, manifest, operator]);
      await db.query(`INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,review_status,commercial_cap,currency,created_by)
        VALUES($1,$2,$3,'Evaluation','source_grounded','approved',100,'EUR',$4)`, [evaluation, orgA, projectA, operator]);
      for (const runId of [baselineRun, followupRun]) await db.query(`INSERT INTO evals.run(
        id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase,created_by
      ) VALUES($1,$2,$3,$4,$5,'deployed_system','completed','done',$6)`, [runId, orgA, evaluation, targetRevision, suiteVersion, operator]);
      await db.query(`INSERT INTO evals.finding(id,org_id,run_id,title,severity,evidence_strength,frequency_n,frequency_denominator,observation,recommendation)
        VALUES($1,$2,$3,'Finding','high','reviewed',1,1,'Observed','Improve')`, [finding, orgA, baselineRun]);
      await db.query(`INSERT INTO evals.comparison(id,org_id,project_id,baseline_run_id,candidate_run_id,policy_hash,status,reason_codes,snapshot,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'compatible','{}','{}',$7)`, [comparison, orgA, projectA, baselineRun, followupRun, hash, operator]);
      await db.query(`INSERT INTO evals.expert_profile(id,user_id,domains,jurisdictions,languages,credentials_status,terms_status,eligibility_status,created_by)
        VALUES($1,$2,'{insurance}','{ES}','{en}','verified','accepted','eligible',$5),($3,$4,'{insurance}','{ES}','{en}','verified','accepted','eligible',$5)`, [profileA, expertA, profileB, expertB, operator]);
      await db.query(`INSERT INTO evals.expert_guideline_revision(id,org_id,project_id,guideline_id,content_hash,document,created_by)
        VALUES($1,$2,$3,$1,$4,'{}',$5)`, [guideline, orgA, projectA, hash, operator]);
      await db.query(`INSERT INTO evals.expert_assignment(id,org_id,project_id,assigned_profile_id,kind,severity,guideline_revision_id,status,created_by)
        VALUES($1,$2,$3,$4,'authoring','high',$5,'submitted',$6)`, [assignment, orgA, projectA, profileA, guideline, operator]);
      await db.query(`INSERT INTO evals.expert_assignment_evidence(org_id,assignment_id,content_hash,snapshot) VALUES($1,$2,$3,'{"excerpts":[{"anchor":"a","text":"redacted"}],"transcript":[]}')`, [orgA, assignment, hash]);
      await db.query(`INSERT INTO evals.expert_submission_revision(id,org_id,assignment_id,author_profile_id,version,parent_lock_version,content_hash,document,status)
        VALUES($1,$2,$3,$4,1,0,$5,'{"answer":"corrected","rationale":"grounded","source_refs":[],"flags":[]}','submitted')`, [submission, orgA, assignment, profileA, hash]);
      await db.query("UPDATE evals.expert_assignment SET current_submission_revision_id=$2,lock_version=1 WHERE id=$1", [assignment, submission]);
      await db.query(`INSERT INTO evals.expert_assignment(id,org_id,project_id,assigned_profile_id,kind,severity,guideline_revision_id,review_of_submission_revision_id,status,created_by)
        VALUES($1,$2,$3,$4,'independent_review','high',$5,$6,'approved',$7)`, [reviewAssignment, orgA, projectA, profileB, guideline, submission, operator]);
      await db.query(`INSERT INTO evals.expert_assignment_evidence(org_id,assignment_id,content_hash,snapshot) VALUES($1,$2,$3,'{"excerpts":[{"anchor":"a","text":"redacted"}],"transcript":[]}')`, [orgA, reviewAssignment, hash]);
      await db.query(`INSERT INTO evals.expert_quality_review(org_id,review_assignment_id,submission_revision_id,author_profile_id,reviewer_profile_id,decision,severity,rationale)
        VALUES($1,$2,$3,$4,$5,'approve','high','Supported')`, [orgA, reviewAssignment, submission, profileA, profileB]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  });

  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  async function createCandidate(input: { family: string; split: string; decision: string; reviewer: string }) {
    return withTenant({ orgId: orgA, actorId: operator }, async (db) => {
      const batch = (await db.query("INSERT INTO evals.improvement_batch(org_id,project_id,title) VALUES($1,$2,'Batch') RETURNING id", [orgA, projectA])).rows[0];
      const task = (await db.query(`INSERT INTO evals.improvement_task(org_id,batch_id,finding_id,expert_assignment_id,kind,family_id,split,rights_basis)
        VALUES($1,$2,$3,$4,'grounded_qa',$5,$6,'customer_owned') RETURNING id`, [orgA, batch.id, finding, assignment, input.family, input.split])).rows[0];
      const item = (await db.query(`INSERT INTO evals.dataset_item(org_id,batch_id,task_id,kind,family_id,split)
        VALUES($1,$2,$3,'grounded_qa',$4,$5) RETURNING id`, [orgA, batch.id, task.id, input.family, input.split])).rows[0];
      const revision = (await db.query(`INSERT INTO evals.dataset_item_revision(org_id,item_id,task_id,finding_id,submission_revision_id,author_profile_id,content_hash,document)
        VALUES($1,$2,$3,$4,$5,$6,$7,'{}') RETURNING id`, [orgA, item.id, task.id, finding, submission, profileA, hash])).rows[0];
      await db.query(`INSERT INTO evals.dataset_item_review(org_id,item_revision_id,reviewer_profile_id,decision,rights_status,redaction_status,rationale)
        VALUES($1,$2,$3,$4,'permitted','approved','Checked')`, [orgA, revision.id, input.reviewer, input.decision]);
      return { batchId: batch.id, revisionId: revision.id };
    });
  }

  it("isolates tenants and rejects self-review and rejected release candidates", async () => {
    const otherBatch = randomUUID();
    await owner.query("INSERT INTO evals.improvement_batch(id,org_id,project_id,title,created_by) VALUES($1,$2,$3,'Other',$4)", [otherBatch, orgB, projectB, operator]);
    expect(await withTenant({ orgId: orgA, actorId: operator }, async (db) => (await db.query("SELECT id FROM evals.improvement_batch WHERE id=$1", [otherBatch])).rowCount)).toBe(0);
    await expect(createCandidate({ family: "self", split: "training", decision: "approve", reviewer: profileA })).rejects.toThrow(/independent_review_required/);
    const rejected = await createCandidate({ family: "rejected", split: "training", decision: "reject", reviewer: profileB });
    await expect(withTenant({ orgId: orgA, actorId: operator }, async (db) => {
      const release = (await db.query(`INSERT INTO evals.dataset_release(org_id,batch_id,project_id,content_hash,manifest,public_key_fingerprint)
        VALUES($1,$2,$3,$4,'{}',$4) RETURNING id`, [orgA, rejected.batchId, projectA, hash])).rows[0];
      await db.query("INSERT INTO evals.dataset_release_item(org_id,release_id,item_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgA, release.id, rejected.revisionId]);
    })).rejects.toThrow(/release_candidate_not_approved/);
  });

  it("keeps revisions immutable and blocks sibling-family contamination across releases", async () => {
    const holdout = await createCandidate({ family: "shared-family", split: "holdout", decision: "approve", reviewer: profileB });
    await expect(owner.query("UPDATE evals.dataset_item_revision SET document='{}' WHERE id=$1", [holdout.revisionId])).rejects.toThrow(/immutable evidence/);
    await withTenant({ orgId: orgA, actorId: operator }, async (db) => {
      const release = (await db.query(`INSERT INTO evals.dataset_release(org_id,batch_id,project_id,content_hash,manifest,public_key_fingerprint)
        VALUES($1,$2,$3,$4,'{}',$4) RETURNING id`, [orgA, holdout.batchId, projectA, hash])).rows[0];
      await db.query("INSERT INTO evals.dataset_release_item(org_id,release_id,item_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgA, release.id, holdout.revisionId]);
    });
    const training = await createCandidate({ family: "shared-family", split: "training", decision: "approve", reviewer: profileB });
    await expect(withTenant({ orgId: orgA, actorId: operator }, async (db) => {
      const release = (await db.query(`INSERT INTO evals.dataset_release(org_id,batch_id,project_id,content_hash,manifest,public_key_fingerprint)
        VALUES($1,$2,$3,$4,'{}',$4) RETURNING id`, [orgA, training.batchId, projectA, hash])).rows[0];
      await db.query("INSERT INTO evals.dataset_release_item(org_id,release_id,item_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgA, release.id, training.revisionId]);
    })).rejects.toThrow(/family_split_overlap/);
  });

  it("binds interventions to tenant-matched baseline, follow-up and comparison records", async () => {
    const candidate = await createCandidate({ family: "validation-family", split: "validation", decision: "approve", reviewer: profileB });
    await withTenant({ orgId: orgA, actorId: operator }, async (db) => {
      const release = (await db.query(`INSERT INTO evals.dataset_release(org_id,batch_id,project_id,content_hash,manifest,public_key_fingerprint)
        VALUES($1,$2,$3,$4,'{}',$4) RETURNING id`, [orgA, candidate.batchId, projectA, hash])).rows[0];
      await db.query("INSERT INTO evals.dataset_release_item(org_id,release_id,item_revision_id,ordinal) VALUES($1,$2,$3,0)", [orgA, release.id, candidate.revisionId]);
      const intervention = (await db.query(`INSERT INTO evals.intervention_record(org_id,project_id,release_id,baseline_run_id,description,evidence_reference)
        VALUES($1,$2,$3,$4,'Customer updated retrieval content','change-ticket-1') RETURNING id`, [orgA, projectA, release.id, baselineRun])).rows[0];
      await db.query(`INSERT INTO evals.intervention_validation(org_id,intervention_id,followup_run_id,comparison_id,snapshot)
        VALUES($1,$2,$3,$4,'{"causality":"observational_after_recorded_intervention"}')`, [orgA, intervention.id, followupRun, comparison]);
      expect((await db.query("SELECT count(*)::int AS count FROM evals.intervention_validation WHERE intervention_id=$1", [intervention.id])).rows[0].count).toBe(1);
    });
  });

  it("promotes independently approved work, gates release, seals bytes and reauthorizes download", async () => {
    const scope = { orgId: orgA, actorId: operator };
    const batch = await createImprovementBatch(scope, { projectId: projectA, title: "Correction batch", objective: "Correct the observed failure." });
    const task = await createImprovementTask(scope, batch.id, {
      findingId: finding, expertAssignmentId: assignment, kind: "corrected_response",
      familyId: "correction-family", split: "training", rightsBasis: "customer_owned",
    });
    const promoted = await promoteApprovedSubmission(scope, task.id, submission);
    expect(promoted).toMatchObject({ status: "draft" });
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const memory = new Map<string, Buffer>();
    const artifacts: DatasetArtifactStore = {
      async seal(key, bytes) { if (memory.has(key)) throw new Error("exists"); memory.set(key, Buffer.from(bytes)); },
      async read(key, expectedBytes, expectedHash) {
        const bytes = memory.get(key); if (!bytes || bytes.length !== expectedBytes) throw new Error("size");
        if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) throw new Error("hash");
        return bytes;
      },
    };
    await expect(releaseDataset(scope, batch.id, privateKey, artifacts)).rejects.toThrow("review_required");
    await reviewDatasetItem(scope, promoted.revisionId, {
      reviewerProfileId: profileB, decision: "approve", rightsStatus: "permitted",
      redactionStatus: "approved", rationale: "Rights and redaction checked.",
    });
    const released = await releaseDataset(scope, batch.id, privateKey, artifacts);
    const replayed = await releaseDataset(scope, batch.id, privateKey, artifacts);
    expect(replayed).toEqual(released);
    expect(memory.size).toBe(1);
    const downloaded = await getDatasetArtifact(scope, released.artifactId, artifacts);
    expect(verifyDatasetArtifact(downloaded.bytes, publicKey).manifest.release_id).toBe(released.releaseId);
    await expect(getDatasetArtifact({ orgId: orgB, actorId: operator }, released.artifactId, artifacts)).rejects.toMatchObject({ status: 404 });
  });
});
