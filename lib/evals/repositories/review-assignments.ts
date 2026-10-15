import "server-only";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

/**
 * "Assign to me" in the ops review queue (launch G1, spec v2 §5.3; migration
 * 113). Staff claim a test set awaiting approval (`evaluation`) or a result
 * needing review (`assessment`); the SQL functions check the staff role and
 * workspace access, serialise claims per item and write the audit trail.
 */
export type ReviewSubjectKind = "evaluation" | "assessment";
/** `mine`: held by the person asking. */
export type ReviewAssignment = { subjectKind: ReviewSubjectKind; subjectId: string; assigneeId: string; assigneeName: string | null; assignedAt: string; mine: boolean };
export type ReviewAssignmentChange = { subjectKind: ReviewSubjectKind; subjectId: string; action: "assign" | "release"; takeOver?: boolean };

type Row = { subject_kind: ReviewSubjectKind; subject_id: string; assignee_id: string; assignee_name?: string | null; assigned_at: Date | string };
const view = (actorId: string) => (row: Row): ReviewAssignment => ({
  subjectKind: row.subject_kind, subjectId: row.subject_id, assigneeId: row.assignee_id,
  assigneeName: row.assignee_name ?? null, assignedAt: new Date(row.assigned_at).toISOString(), mine: row.assignee_id === actorId,
});

function assignmentError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || message === "SESSION_REQUIRED") throw new EvalError("SCOPE_DENIED", 404);
  if (message === "REVIEW_ASSIGNED") throw new EvalError("REVIEW_ASSIGNED", 409, "Someone else is already reviewing this item. Refresh the queue, or take it over.");
  if (message === "INPUT_INVALID") throw new EvalError("INPUT_INVALID", 422, "Check the supplied fields.");
  throw error;
}

/** Current claims in one workspace, with the holder's name (staff only). */
export function listReviewAssignments(scope: EvidenceScope): Promise<ReviewAssignment[]> {
  return withTenant(scope, async (db) => (await db.query<Row>("SELECT * FROM evals.review_assignments($1)", [scope.orgId])).rows.map(view(scope.actorId))).catch(assignmentError);
}

/** Claim, take over or release one queue item; returns the item's claim afterwards (null when free). */
export function changeReviewAssignment(scope: EvidenceScope, input: ReviewAssignmentChange): Promise<ReviewAssignment | null> {
  return withTenant(scope, async (db) => {
    const row = (await db.query<Row>("SELECT * FROM evals.review_assignment_change($1,$2,$3,$4,$5)", [scope.orgId, input.subjectKind, input.subjectId, input.action, input.takeOver ?? false])).rows[0];
    if (!row) return null;
    const name = (await db.query<{ assignee_name: string | null }>("SELECT assignee_name FROM evals.review_assignments($1) WHERE subject_kind=$2 AND subject_id=$3", [scope.orgId, input.subjectKind, input.subjectId])).rows[0];
    return view(scope.actorId)({ ...row, assignee_name: name?.assignee_name ?? null });
  }).catch(assignmentError);
}
