import "server-only";

import type { PoolClient } from "pg";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { queueObservationRetention } from "@/lib/evals/operations/lifecycle";
import { isRetentionDays, type ObservationRetentionDays } from "./flags";

/**
 * Answer retention (launch L-32, spec P-44). An owner keeps observations (the
 * answers a system gave in test runs) for 30, 90 or 365 days, or until they
 * delete them (unset, the default and the behaviour before L-32). The
 * scheduler applies it through the existing retention jobs
 * (lib/evals/operations/lifecycle.ts); evals.observation_retention_pinned
 * keeps the answers that kept reports, active runs and regression cases use.
 * Every change is audited by evals.set_observation_retention (migration 105).
 */
export type RetentionPreview = { days: ObservationRetentionDays; due: number; pinned: number; purged: number };
export type RetentionStatus = {
  observationDays: ObservationRetentionDays | null;
  version: number;
  updatedAt: string | null;
  /** Owners only; a platform administrator never decides retention for a customer. */
  canChange: boolean;
  /** Read-only counts for `previewDays`: what a purge would remove now, what the pins keep, what is already purged. */
  preview: RetentionPreview | null;
};

type SettingRow = { observation_days: number | null; version: number; updated_at: Date | string | null };

async function isOwner(db: PoolClient, orgId: string, userId: string) {
  const { rows } = await db.query<{ role: string }>("SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2", [orgId, userId]);
  return rows[0]?.role === "owner";
}

export async function retentionPreview(db: PoolClient, orgId: string, days: ObservationRetentionDays): Promise<RetentionPreview> {
  const { rows } = await db.query<{ due: string; pinned: string; purged: string }>(
    "SELECT due::text, pinned::text, purged::text FROM evals.observation_retention_preview($1,$2)",
    [orgId, days],
  );
  return { days, due: Number(rows[0]?.due ?? 0), pinned: Number(rows[0]?.pinned ?? 0), purged: Number(rows[0]?.purged ?? 0) };
}

function status(row: SettingRow | undefined, canChange: boolean, preview: RetentionPreview | null): RetentionStatus {
  const days = row?.observation_days ?? null;
  return {
    observationDays: isRetentionDays(days) ? days : null,
    version: row?.version ?? 0,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    canChange,
    preview,
  };
}

/** The workspace's setting, for any member; with `previewDays`, the counts that period would mean now. */
export function getRetention(identity: EvalIdentity, orgId: string, previewDays?: ObservationRetentionDays): Promise<RetentionStatus> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    const row = (await db.query<SettingRow>("SELECT observation_days, version, updated_at FROM evals.workspace_retention WHERE org_id=$1", [orgId])).rows[0];
    return status(row, await isOwner(db, orgId, identity.user.id), previewDays ? await retentionPreview(db, orgId, previewDays) : null);
  });
}

/** Owners set or clear the period; the function refuses anyone else and records the change in the audit log. */
export function setRetention(identity: EvalIdentity, orgId: string, days: ObservationRetentionDays | null): Promise<RetentionStatus> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    if (!(await isOwner(db, orgId, identity.user.id))) {
      throw new EvalError("OWNER_REQUIRED", 403, "Only a workspace owner can change how long answers are kept.");
    }
    try {
      await db.query("SAVEPOINT retention_setting");
      await db.query("SELECT * FROM evals.set_observation_retention($1,$2)", [orgId, days]);
      await db.query("RELEASE SAVEPOINT retention_setting");
      // A shorter period applies now: the due runs become retention jobs at once, and the
      // scheduler's next lifecycle pass (every minute) purges them; the hourly pass catches the rest.
      if (days) await queueObservationRetention(db, orgId);
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT retention_setting");
      const message = error instanceof Error ? error.message : "";
      if (message === "OWNER_REQUIRED") throw new EvalError("OWNER_REQUIRED", 403, "Only a workspace owner can change how long answers are kept.");
      if (message === "RETENTION_INVALID") throw new EvalError("INPUT_INVALID", 422, "Choose 30, 90 or 365 days, or keep answers until you delete them.");
      throw error;
    }
    const row = (await db.query<SettingRow>("SELECT observation_days, version, updated_at FROM evals.workspace_retention WHERE org_id=$1", [orgId])).rows[0];
    return status(row, true, days ? await retentionPreview(db, orgId, days) : null);
  });
}

/**
 * Whether any answer of a run was removed under the retention setting. Grading
 * or reporting such a run again would read empty answers, so those paths
 * refuse it (RETENTION_EXPIRED).
 */
export async function assertAnswersRetained(db: PoolClient, orgId: string, runId: string) {
  const purged = (await db.query("SELECT 1 FROM evals.observation WHERE org_id=$1 AND run_id=$2 AND purged_at IS NOT NULL LIMIT 1", [orgId, runId])).rowCount;
  if (purged) {
    throw new EvalError("RETENTION_EXPIRED", 409, "This run's answers were removed under the workspace's retention setting, so it can't be graded or reported again.");
  }
}
