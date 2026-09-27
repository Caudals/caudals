import "server-only";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

/**
 * Rename and delete for the everyday objects of a workspace.
 *
 * Delete archives: the item leaves every list and cannot be used for new
 * work, but cases, observations, assessments and report revisions stay
 * immutable for audit and follow the workspace retention policy. Deleting
 * the whole workspace is the separate, audited deletion workflow.
 */
export const ITEM_KINDS = ["evaluations", "systems", "test-sets", "reports", "sources"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

const titleSchema = z.string().trim().min(1).max(200);
const ACTIVE_RUN = ["queued", "running", "pause_requested", "cancel_requested"];

/** Audit where the actor's role may write the log (owners, operators, admins); never block the change. */
async function audit(db: import("pg").PoolClient, scope: EvidenceScope, action: string, id: string) {
  await db.query("SAVEPOINT lifecycle_audit");
  try {
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)", [scope.orgId, scope.actorId, action, id]);
    await db.query("RELEASE SAVEPOINT lifecycle_audit");
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT lifecycle_audit");
  }
}

export function renameItem(scope: EvidenceScope, kind: ItemKind, id: string, raw: unknown) {
  const { title } = z.strictObject({ title: titleSchema }).parse(raw);
  return withTenant(scope, async (db) => {
    const statement = {
      evaluations: "UPDATE evals.evaluation SET title=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id,project_id",
      systems: "UPDATE evals.target SET title=$3 WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id",
      "test-sets": "UPDATE evals.suite SET title=$3 WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id",
      reports: "UPDATE evals.report SET title=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id",
      sources: 'UPDATE evals."source" SET title=$3 WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id',
    }[kind];
    const row = (await db.query(statement, [scope.orgId, id, title])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    // An evaluation and its project share a name in every list; keep them in step.
    if (kind === "evaluations") await db.query("UPDATE evals.project SET title=$3 WHERE org_id=$1 AND id=$2", [scope.orgId, row.project_id, title]);
    await audit(db, scope, `${kind}.renamed`, id);
    return { id, title };
  });
}

export function deleteItem(scope: EvidenceScope, kind: ItemKind, id: string) {
  return withTenant(scope, async (db) => {
    if (kind === "evaluations") {
      const evaluation = (await db.query("SELECT id FROM evals.evaluation WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, id])).rows[0];
      if (!evaluation) throw new EvalError("SCOPE_DENIED", 404);
      const active = (await db.query("SELECT 1 FROM evals.run WHERE org_id=$1 AND evaluation_id=$2 AND status=ANY($3::text[]) LIMIT 1", [scope.orgId, id, ACTIVE_RUN])).rowCount;
      if (active) throw new EvalError("VERSION_CONFLICT", 409, "This evaluation is running. Cancel the run first, then delete it.");
      await db.query("UPDATE evals.evaluation SET archived_at=now(),updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, id]);
      // Its reports go with it, and every share link stops working.
      const reports = (await db.query(`UPDATE evals.report rp SET archived_at=now(),updated_at=now()
        WHERE rp.org_id=$1 AND rp.archived_at IS NULL AND EXISTS (
          SELECT 1 FROM evals.report_revision rr JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id)
          WHERE rr.org_id=rp.org_id AND rr.report_id=rp.id AND r.evaluation_id=$2) RETURNING rp.id`, [scope.orgId, id])).rows.map((row) => row.id as string);
      await revokeShares(db, scope.orgId, reports);
      await db.query("UPDATE evals.monitor_schedule SET status='paused',reason_code='evaluation_deleted',updated_at=now() WHERE org_id=$1 AND evaluation_id=$2 AND status='active'", [scope.orgId, id]);
    } else if (kind === "systems") {
      const target = (await db.query("SELECT id,project_id FROM evals.target WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, id])).rows[0];
      if (!target) throw new EvalError("SCOPE_DENIED", 404);
      const used = (await db.query("SELECT title FROM evals.evaluation WHERE org_id=$1 AND project_id=$2 AND archived_at IS NULL LIMIT 1", [scope.orgId, target.project_id])).rows[0];
      if (used) throw new EvalError("VERSION_CONFLICT", 409, `The evaluation “${used.title}” tests this system. Delete that evaluation first.`);
      await db.query("UPDATE evals.target SET archived_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, id]);
    } else if (kind === "test-sets") {
      const suite = (await db.query("SELECT id FROM evals.suite WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, id])).rows[0];
      if (!suite) throw new EvalError("SCOPE_DENIED", 404);
      const used = (await db.query(`SELECT e.title FROM evals.evaluation e JOIN evals.suite_version sv ON (sv.org_id,sv.id)=(e.org_id,e.selected_suite_version_id)
        WHERE e.org_id=$1 AND sv.suite_id=$2 AND e.archived_at IS NULL LIMIT 1`, [scope.orgId, id])).rows[0];
      if (used) throw new EvalError("VERSION_CONFLICT", 409, `The evaluation “${used.title}” uses this test set. Delete that evaluation first.`);
      await db.query("UPDATE evals.suite SET archived_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, id]);
    } else if (kind === "reports") {
      const report = (await db.query("UPDATE evals.report SET archived_at=now(),updated_at=now() WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id", [scope.orgId, id])).rows[0];
      if (!report) throw new EvalError("SCOPE_DENIED", 404);
      await revokeShares(db, scope.orgId, [id]);
    } else {
      const source = (await db.query('UPDATE evals."source" SET archived_at=now() WHERE org_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id', [scope.orgId, id])).rows[0];
      if (!source) throw new EvalError("SCOPE_DENIED", 404);
    }
    await audit(db, scope, `${kind}.deleted`, id);
    return { id, deleted: true };
  });
}

async function revokeShares(db: import("pg").PoolClient, orgId: string, reportIds: string[]) {
  if (!reportIds.length) return;
  await db.query(`UPDATE evals.share_grant g SET revoked_at=now() FROM evals.report_revision rr
    WHERE g.org_id=$1 AND rr.org_id=g.org_id AND rr.id=g.report_revision_id AND rr.report_id=ANY($2::uuid[]) AND g.revoked_at IS NULL`, [orgId, reportIds]);
}

export function renameWorkspace(scope: EvidenceScope, raw: unknown) {
  const { name } = z.strictObject({ name: z.string().trim().min(1).max(120) }).parse(raw);
  return withTenant(scope, async (db) => {
    await db.query("SELECT evals.rename_workspace($1,$2)", [scope.orgId, name]);
    return { id: scope.orgId, name };
  });
}
