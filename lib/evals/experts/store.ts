import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withContentHash } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { withTenant, type TenantContext } from "../repositories/db";
import { idempotent } from "../repositories/identity";
import {
  expertAssignmentInputSchema,
  expertGuidelineSchema,
  expertProfileInputSchema,
  expertSubmissionDocumentSchema,
  qualityDecisionSchema,
  redactedAssignmentProjection,
  type ExpertAssignmentInput,
  type ExpertProfileInput,
  type ExpertSubmissionDocument,
} from "./contracts";

export type ExpertActor = { userId: string; profileId: string };
type Scope = TenantContext;

function denied(message = "Assigned work was not found."): never {
  throw new EvalError("SCOPE_DENIED", 404, message);
}

function invalid(message: string): never {
  throw new EvalError("INPUT_INVALID", 422, message);
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export async function createExpertProfile(actorId: string, rawInput: ExpertProfileInput, key?: string) {
  const input = expertProfileInputSchema.parse(rawInput);
  return withTenant({ orgId: "", actorId }, async (db) => idempotent(db, actorId, "expert-profiles", key ?? randomUUID(), input, async () => {
    const row = (await db.query<{ id: string }>(
      `INSERT INTO evals.expert_profile(
        user_id,domains,jurisdictions,languages,credentials_status,terms_status,eligibility_status,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.userId, input.domains, input.jurisdictions, input.languages, input.credentialsStatus,
        input.termsStatus, input.eligibilityStatus, actorId],
    )).rows[0];
    if (!row) denied();
    return row;
  }));
}

const guidelineInputSchema = z.strictObject({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(30_000),
  criteria: expertGuidelineSchema.shape.criteria,
  supersedesRevisionId: z.uuid().nullable(),
});

export async function createGuidelineRevision(scope: Scope, rawInput: z.input<typeof guidelineInputSchema>, key?: string) {
  const input = guidelineInputSchema.parse(rawInput);
  return withTenant(scope, async (db) => idempotent(db, scope.actorId, `expert-guidelines/${scope.orgId}`, key ?? randomUUID(), input, async () => {
    const project = (await db.query("SELECT id FROM evals.project WHERE org_id=$1 AND id=$2", [scope.orgId, input.projectId])).rows[0];
    if (!project) denied("Project was not found.");

    let guidelineId: string = randomUUID();
    if (input.supersedesRevisionId) {
      const previous = (await db.query<{ guideline_id: string }>(
        `SELECT guideline_id FROM evals.expert_guideline_revision
         WHERE org_id=$1 AND project_id=$2 AND id=$3`,
        [scope.orgId, input.projectId, input.supersedesRevisionId],
      )).rows[0];
      if (!previous) invalid("The superseded guideline does not belong to this project.");
      guidelineId = previous.guideline_id;
    }

    const revisionId = randomUUID();
    const document = expertGuidelineSchema.parse(withContentHash({
      schema_version: "1.0",
      revision_id: revisionId,
      title: input.title,
      instructions: input.instructions,
      criteria: input.criteria,
      created_at: new Date().toISOString(),
    }));
    await db.query(
      `INSERT INTO evals.expert_guideline_revision(
        id,org_id,project_id,guideline_id,supersedes_revision_id,content_hash,document
      ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [revisionId, scope.orgId, input.projectId, guidelineId, input.supersedesRevisionId,
        document.content_hash, document],
    );
    if (input.supersedesRevisionId) {
      await db.query(
        `UPDATE evals.expert_assignment
         SET status='guideline_changed',replacement_guideline_revision_id=$3,updated_at=now()
         WHERE org_id=$1 AND guideline_revision_id=$2
           AND status IN ('assigned','in_progress','conflict','changes_requested')`,
        [scope.orgId, input.supersedesRevisionId, revisionId],
      );
    }
    await db.query(
      "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_guideline.created',$3)",
      [scope.orgId, scope.actorId, revisionId],
    );
    return { revisionId, guidelineId, contentHash: document.content_hash };
  }));
}

type AssignmentCreateInput = ExpertAssignmentInput & { projectId: string };

export async function listExpertProfiles(actorId: string) {
  return withTenant({ orgId: "", actorId }, async (db) => (await db.query(
    `SELECT id,user_id,domains,jurisdictions,languages,credentials_status,terms_status,
      eligibility_status,created_at,updated_at
     FROM evals.expert_profile ORDER BY created_at DESC,id LIMIT 200`,
  )).rows);
}

export async function listExpertAssignments(scope: Scope) {
  return withTenant(scope, async (db) => (await db.query(
    `SELECT a.id,a.project_id,a.assigned_profile_id,a.kind,a.severity,a.status,a.review_phase,
      a.lock_version,a.due_at,a.guideline_revision_id,a.replacement_guideline_revision_id,
      a.review_of_submission_revision_id,a.current_submission_revision_id,a.created_at,a.updated_at
     FROM evals.expert_assignment a WHERE a.org_id=$1
     ORDER BY a.updated_at DESC,a.id LIMIT 200`,
    [scope.orgId],
  )).rows);
}

export async function readExpertAssignment(scope: Scope, assignmentId: string) {
  z.uuid().parse(assignmentId);
  return withTenant(scope, async (db) => {
    const row = (await db.query(
      `SELECT a.*,e.snapshot AS evidence_snapshot,e.content_hash AS evidence_content_hash,
        g.document AS guideline,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',s.id,'version',s.version,'status',s.status,'conflict',s.conflict,
          'author_profile_id',s.author_profile_id,'document',s.document,'created_at',s.created_at
        ) ORDER BY s.version) FROM evals.expert_submission_revision s
          WHERE (s.org_id,s.assignment_id)=(a.org_id,a.id)),'[]'::jsonb) AS revisions,
        COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id)
          FROM evals.expert_quality_review q WHERE (q.org_id,q.review_assignment_id)=(a.org_id,a.id)),'[]'::jsonb) AS quality_reviews
       FROM evals.expert_assignment a
       JOIN evals.expert_assignment_evidence e ON (e.org_id,e.assignment_id)=(a.org_id,a.id)
       JOIN evals.expert_guideline_revision g ON (g.org_id,g.id)=(a.org_id,a.guideline_revision_id)
       WHERE a.org_id=$1 AND a.id=$2`,
      [scope.orgId, assignmentId],
    )).rows[0];
    if (!row) denied();
    return row;
  });
}

export async function createExpertAssignment(scope: Scope, rawInput: AssignmentCreateInput, key?: string) {
  const projectId = z.uuid().parse(rawInput.projectId);
  const input = expertAssignmentInputSchema.parse(Object.fromEntries(
    Object.entries(rawInput).filter(([key]) => key !== "projectId"),
  ));
  return withTenant(scope, async (db) => idempotent(db, scope.actorId, `expert-assignments/${scope.orgId}`, key ?? randomUUID(), rawInput, async () => {
    const expert = (await db.query<{
      id: string; credentials_status: string; terms_status: string; eligibility_status: string;
    }>(
      `SELECT id,credentials_status,terms_status,eligibility_status FROM evals.expert_profile
       WHERE id=$1 FOR SHARE`,
      [input.expertProfileId],
    )).rows[0];
    if (!expert || expert.credentials_status !== "verified" || expert.terms_status !== "accepted" ||
      !["eligible", "calibrating"].includes(expert.eligibility_status)) {
      invalid("The selected expert is not eligible for assignment.");
    }
    const guideline = (await db.query(
      `SELECT id FROM evals.expert_guideline_revision
       WHERE org_id=$1 AND project_id=$2 AND id=$3`,
      [scope.orgId, projectId, input.guidelineRevisionId],
    )).rows[0];
    if (!guideline) invalid("The guideline does not belong to this project.");

    if (input.reviewOfSubmissionRevisionId) {
      const submission = (await db.query<{ author_profile_id: string; status: string }>(
        `SELECT s.author_profile_id,s.status FROM evals.expert_submission_revision s
         JOIN evals.expert_assignment a ON (a.org_id,a.id)=(s.org_id,s.assignment_id)
         WHERE s.org_id=$1 AND a.project_id=$2 AND s.id=$3`,
        [scope.orgId, projectId, input.reviewOfSubmissionRevisionId],
      )).rows[0];
      if (!submission || submission.status !== "submitted") invalid("Review work requires a submitted revision from this project.");
      if (submission.author_profile_id === input.expertProfileId) invalid("Independent review requires a different reviewer.");
    }

    const assignment = (await db.query<{ id: string }>(
      `INSERT INTO evals.expert_assignment(
        org_id,project_id,assigned_profile_id,kind,severity,guideline_revision_id,
        review_of_submission_revision_id,due_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [scope.orgId, projectId, input.expertProfileId, input.kind, input.severity,
        input.guidelineRevisionId, input.reviewOfSubmissionRevisionId, input.dueAt],
    )).rows[0];
    if (!assignment) denied();
    const evidence = withContentHash(input.evidenceSnapshot);
    await db.query(
      `INSERT INTO evals.expert_assignment_evidence(org_id,assignment_id,content_hash,snapshot)
       VALUES($1,$2,$3,$4)`,
      [scope.orgId, assignment.id, evidence.content_hash, input.evidenceSnapshot],
    );
    await db.query(
      `INSERT INTO evals.expert_conflict_declaration(org_id,assignment_id,expert_profile_id,status)
       VALUES($1,$2,$3,$4)`,
      [scope.orgId, assignment.id, input.expertProfileId, input.conflictDeclaration],
    );
    await db.query(
      "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_assignment.created',$3)",
      [scope.orgId, scope.actorId, assignment.id],
    );
    return assignment;
  }));
}

export async function listAssignedWork(actor: ExpertActor) {
  return withTenant({ orgId: "", actorId: actor.userId }, async (db) => {
    const rows = (await db.query<{
      id: string; kind: string; status: string; severity: string; due_at: Date | null; updated_at: Date;
    }>(
      `SELECT a.id,a.kind,a.status,a.severity,a.due_at,a.updated_at
       FROM evals.expert_assignment a
       WHERE a.assigned_profile_id=$1
       ORDER BY a.updated_at DESC,a.id LIMIT 100`,
      [actor.profileId],
    )).rows;
    return rows.map((row) => ({ ...row, due_at: iso(row.due_at), updated_at: iso(row.updated_at) }));
  });
}

export async function readAssignedWork(actor: ExpertActor, assignmentId: string) {
  z.uuid().parse(assignmentId);
  return withTenant({ orgId: "", actorId: actor.userId }, async (db) => {
    const row = (await db.query<{
      id: string; kind: string; status: string; evidence_snapshot: unknown; guideline: unknown;
      due_at: Date | null; own_revision: unknown; review_phase: string; peer_decisions: unknown;
    }>(
      `SELECT a.id,a.kind,a.status,e.snapshot AS evidence_snapshot,g.document AS guideline,
        a.due_at,a.review_phase,
        CASE WHEN own.id IS NULL THEN NULL ELSE jsonb_build_object(
          'version',own.version,'status',own.status,'document',own.document
        ) END AS own_revision,
        CASE WHEN a.review_phase='revealed' THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object('decision',q.decision,'rationale',q.rationale)
            ORDER BY q.created_at,q.id)
          FROM evals.expert_quality_review q WHERE q.review_assignment_id=a.id
        ),'[]'::jsonb) ELSE NULL END AS peer_decisions
       FROM evals.expert_assignment a
       JOIN evals.expert_assignment_evidence e ON (e.org_id,e.assignment_id)=(a.org_id,a.id)
       JOIN evals.expert_guideline_revision g ON (g.org_id,g.id)=(a.org_id,a.guideline_revision_id)
       LEFT JOIN evals.expert_submission_revision own
         ON (own.org_id,own.id)=(a.org_id,a.current_submission_revision_id)
       WHERE a.id=$1 AND a.assigned_profile_id=$2`,
      [assignmentId, actor.profileId],
    )).rows[0];
    if (!row) denied();
    return redactedAssignmentProjection({
      ...row,
      due_at: iso(row.due_at),
      guideline: row.guideline as { title?: unknown; instructions?: unknown },
      own_revision: row.own_revision as { version?: unknown; status?: unknown; document?: unknown } | null,
      peer_decisions: (row.peer_decisions ?? undefined) as Array<{ decision?: unknown; rationale?: unknown }> | undefined,
    });
  });
}

const submissionInputSchema = z.strictObject({
  expectedVersion: z.int().nonnegative(),
  document: expertSubmissionDocumentSchema,
  submit: z.boolean().optional().default(false),
});

export async function saveExpertSubmission(
  actor: ExpertActor,
  assignmentId: string,
  rawInput: { expectedVersion: number; document: ExpertSubmissionDocument; submit?: boolean },
) {
  z.uuid().parse(assignmentId);
  const input = submissionInputSchema.parse(rawInput);
  return withTenant({ orgId: "", actorId: actor.userId }, async (db) => {
    const assignment = (await db.query<{
      org_id: string; assigned_profile_id: string; status: string; lock_version: number;
    }>(
      `SELECT org_id,assigned_profile_id,status,lock_version FROM evals.expert_assignment
       WHERE id=$1 AND assigned_profile_id=$2 FOR UPDATE`,
      [assignmentId, actor.profileId],
    )).rows[0];
    if (!assignment) denied();
    if (["guideline_changed", "canceled", "approved", "rejected", "adjudicated"].includes(assignment.status)) {
      throw new EvalError("WORK_LOCKED", 409, "This assignment is no longer editable.");
    }
    const conflict = (await db.query<{ status: string }>(
      `SELECT status FROM evals.expert_conflict_declaration
       WHERE assignment_id=$1 AND expert_profile_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
      [assignmentId, actor.profileId],
    )).rows[0];
    if (!conflict || conflict.status !== "clear") throw new EvalError("CONFLICT_DISCLOSED", 409, "Resolve the conflict declaration before working.");

    const version = Number((await db.query<{ version: number }>(
      "SELECT COALESCE(max(version),0)::int+1 AS version FROM evals.expert_submission_revision WHERE assignment_id=$1",
      [assignmentId],
    )).rows[0]?.version ?? 1);
    const stale = input.expectedVersion !== assignment.lock_version;
    const revisionId = randomUUID();
    const document = expertSubmissionDocumentSchema.parse(input.document);
    const hashed = withContentHash(document);
    await db.query(
      `INSERT INTO evals.expert_submission_revision(
        id,org_id,assignment_id,author_profile_id,version,parent_lock_version,
        content_hash,document,status,conflict
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [revisionId, assignment.org_id, assignmentId, actor.profileId, version, input.expectedVersion,
        hashed.content_hash, document, input.submit ? "submitted" : "draft", stale],
    );
    if (stale) {
      await db.query("UPDATE evals.expert_assignment SET status='conflict',updated_at=now() WHERE id=$1", [assignmentId]);
    } else {
      await db.query(
        `UPDATE evals.expert_assignment SET current_submission_revision_id=$2,lock_version=$3,
          status=$4,updated_at=now() WHERE id=$1`,
        [assignmentId, revisionId, version, input.submit ? "submitted" : "in_progress"],
      );
    }
    return { revisionId, version, lockVersion: stale ? assignment.lock_version : version, conflict: stale };
  });
}

export function submitExpertWork(
  actor: ExpertActor,
  assignmentId: string,
  input: { expectedVersion: number; document: ExpertSubmissionDocument },
) {
  return saveExpertSubmission(actor, assignmentId, { ...input, submit: true });
}

const qualityInputSchema = z.strictObject({
  decision: z.enum(["approve", "changes_requested", "reject"]),
  rationale: z.string().trim().min(1).max(12_000),
});

export async function recordQualityDecision(actor: ExpertActor, reviewAssignmentId: string, rawInput: z.input<typeof qualityInputSchema>) {
  z.uuid().parse(reviewAssignmentId);
  const input = qualityInputSchema.parse(rawInput);
  return withTenant({ orgId: "", actorId: actor.userId }, async (db) => {
    const binding = (await db.query<{
      org_id: string; assigned_profile_id: string; severity: "low" | "medium" | "high" | "critical";
      review_of_submission_revision_id: string; author_profile_id: string;
    }>(
      `SELECT a.org_id,a.assigned_profile_id,a.severity,a.review_of_submission_revision_id,s.author_profile_id
       FROM evals.expert_assignment a
       JOIN evals.expert_submission_revision s
         ON (s.org_id,s.id)=(a.org_id,a.review_of_submission_revision_id)
       WHERE a.id=$1 AND a.assigned_profile_id=$2 AND a.kind IN ('independent_review','adjudication')
       FOR UPDATE OF a`,
      [reviewAssignmentId, actor.profileId],
    )).rows[0];
    if (!binding) denied();
    const decision = qualityDecisionSchema.parse({
      ...input,
      authorProfileId: binding.author_profile_id,
      reviewerProfileId: binding.assigned_profile_id,
      submissionRevisionId: binding.review_of_submission_revision_id,
      severity: binding.severity,
    });
    const row = (await db.query<{ id: string }>(
      `INSERT INTO evals.expert_quality_review(
        org_id,review_assignment_id,submission_revision_id,author_profile_id,
        reviewer_profile_id,decision,severity,rationale
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [binding.org_id, reviewAssignmentId, decision.submissionRevisionId, decision.authorProfileId,
        decision.reviewerProfileId, decision.decision, decision.severity, decision.rationale],
    )).rows[0];
    await db.query(
      "UPDATE evals.expert_assignment SET status=$2,updated_at=now() WHERE id=$1",
      [reviewAssignmentId, decision.decision === "approve" ? "approved" : decision.decision === "reject" ? "rejected" : "changes_requested"],
    );
    return { id: row.id, decision: decision.decision };
  });
}

export async function revealReviewPhase(scope: Scope, assignmentId: string) {
  z.uuid().parse(assignmentId);
  return withTenant(scope, async (db) => {
    const row = (await db.query<{ id: string }>(
      `UPDATE evals.expert_assignment SET review_phase='revealed',updated_at=now()
       WHERE org_id=$1 AND id=$2 AND kind IN ('independent_review','adjudication') RETURNING id`,
      [scope.orgId, assignmentId],
    )).rows[0];
    if (!row) denied();
    await db.query(
      "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_review.revealed',$3)",
      [scope.orgId, scope.actorId, assignmentId],
    );
    return row;
  });
}

export async function resolveSubmissionConflict(scope: Scope, assignmentId: string, revisionId: string) {
  z.uuid().parse(assignmentId); z.uuid().parse(revisionId);
  return withTenant(scope, async (db) => {
    const assignment = (await db.query<{ status: string }>(
      "SELECT status FROM evals.expert_assignment WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [scope.orgId, assignmentId],
    )).rows[0];
    if (!assignment) denied();
    if (assignment.status !== "conflict") throw new EvalError("VERSION_CONFLICT", 409, "This assignment no longer has a save conflict.");
    const revision = (await db.query<{ version: number; status: string }>(
      `SELECT version,status FROM evals.expert_submission_revision
       WHERE org_id=$1 AND assignment_id=$2 AND id=$3`,
      [scope.orgId, assignmentId, revisionId],
    )).rows[0];
    if (!revision) denied("Submission revision was not found.");
    const status = revision.status === "submitted" ? "submitted" : "in_progress";
    await db.query(
      `UPDATE evals.expert_assignment SET current_submission_revision_id=$3,
        lock_version=$4,status=$5,updated_at=now() WHERE org_id=$1 AND id=$2`,
      [scope.orgId, assignmentId, revisionId, revision.version, status],
    );
    await db.query(
      "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_conflict.resolved',$3)",
      [scope.orgId, scope.actorId, assignmentId],
    );
    return { id: assignmentId, revisionId, lockVersion: revision.version, status };
  });
}

const paymentInputSchema = z.strictObject({
  assignmentId: z.uuid(),
  amount: z.string().regex(/^\d{1,15}(?:\.\d{1,9})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["planned", "invoiced", "paid", "void"]),
  note: z.string().max(4_000),
});

export async function createPaymentRecord(scope: Scope, rawInput: z.input<typeof paymentInputSchema>, key?: string) {
  const input = paymentInputSchema.parse(rawInput);
  return withTenant(scope, async (db) => idempotent(db, scope.actorId, `expert-payments/${scope.orgId}/${input.assignmentId}`, key ?? randomUUID(), input, async () => {
    const row = (await db.query(
      `INSERT INTO evals.expert_payment_record(org_id,assignment_id,amount,currency,status,note)
       SELECT $1,$2,$3,$4,$5,$6
       WHERE EXISTS(SELECT 1 FROM evals.expert_assignment WHERE org_id=$1 AND id=$2)
       RETURNING id,assignment_id,amount,currency,status,note,created_at`,
      [scope.orgId, input.assignmentId, input.amount, input.currency, input.status, input.note],
    )).rows[0];
    if (!row) denied();
    return row;
  }));
}

export async function listPaymentRecords(scope: Scope, assignmentId: string) {
  z.uuid().parse(assignmentId);
  return withTenant(scope, async (db) => {
    const exists = (await db.query("SELECT id FROM evals.expert_assignment WHERE org_id=$1 AND id=$2", [scope.orgId, assignmentId])).rows[0];
    if (!exists) denied();
    return (await db.query(
      `SELECT id,assignment_id,amount,currency,status,note,created_at
       FROM evals.expert_payment_record WHERE org_id=$1 AND assignment_id=$2
       ORDER BY created_at,id`,
      [scope.orgId, assignmentId],
    )).rows;
  });
}
