import "server-only";
import { z } from "zod";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

/**
 * In-app notification centre and job activity for one workspace.
 * Notices are written by workflows and by job-transition triggers
 * (migration 065); read state is per person. Preferences from Settings →
 * Notifications decide which categories a person sees.
 */
export const NOTICE_CATEGORY: Record<string, "completion" | "required_input" | "failure" | "progress"> = {
  report_published: "completion", test_set_ready: "completion", website_ready: "completion", document_ready: "completion",
  export_completed: "completion", monitor_pass: "completion",
  input_required: "required_input", generation_paused: "required_input", run_paused: "required_input",
  run_failed: "failure", generation_failed: "failure", website_failed: "failure", document_failed: "failure",
  export_failed: "failure", monitor_regression: "failure", monitor_inconclusive: "failure", run_canceled: "failure",
  website_started: "progress", generation_started: "progress", run_started: "progress",
};

export function listNotifications(scope: EvidenceScope, limit = 50) {
  return withTenant(scope, async (db) => {
    const preferences = (await db.query("SELECT completion,required_input,failure FROM evals.notification_preference WHERE org_id=$1 AND user_id=$2", [scope.orgId, scope.actorId])).rows[0]
      ?? { completion: true, required_input: true, failure: true };
    const hidden = Object.entries(NOTICE_CATEGORY).filter(([, category]) => category !== "progress" && !preferences[category]).map(([kind]) => kind);
    const rows = (await db.query(`SELECT n.id,n.kind,n.payload,n.created_at,(r.notification_id IS NOT NULL) AS read
      FROM evals.notification n LEFT JOIN evals.notification_read r ON (r.org_id,r.notification_id)=(n.org_id,n.id) AND r.user_id=$2
      WHERE n.org_id=$1 AND n.audience='workspace' AND n.status<>'dismissed' AND n.created_at>now()-interval '30 days' AND NOT (n.kind=ANY($3::text[]))
      ORDER BY n.created_at DESC,n.id LIMIT $4`, [scope.orgId, scope.actorId, hidden, Math.min(200, Math.max(1, limit))])).rows;
    // Progress notices ("started") are shown in Activity, not counted as unread.
    const unread = rows.filter((row) => !row.read && NOTICE_CATEGORY[row.kind] !== "progress").length;
    return { notifications: rows.map((row) => ({ ...row, category: NOTICE_CATEGORY[row.kind] ?? "completion" })), unread };
  });
}

export function markNotificationsRead(scope: EvidenceScope, raw: unknown) {
  const input = z.union([z.strictObject({ ids: z.array(z.uuid()).min(1).max(200) }), z.strictObject({ all: z.literal(true) })]).parse(raw);
  return withTenant(scope, async (db) => {
    const result = "all" in input
      ? await db.query(`INSERT INTO evals.notification_read(org_id,notification_id,user_id)
          SELECT org_id,id,$2 FROM evals.notification WHERE org_id=$1 AND created_at>now()-interval '30 days' ON CONFLICT DO NOTHING`, [scope.orgId, scope.actorId])
      : await db.query(`INSERT INTO evals.notification_read(org_id,notification_id,user_id)
          SELECT org_id,id,$2 FROM evals.notification WHERE org_id=$1 AND id=ANY($3::uuid[]) ON CONFLICT DO NOTHING`, [scope.orgId, scope.actorId, input.ids]);
    return { marked: result.rowCount ?? 0 };
  });
}

/** Queued, running and recently finished work, newest first, with progress where it is known. */
export function listActivity(scope: EvidenceScope) {
  return withTenant(scope, async (db) => (await db.query(`SELECT * FROM (
      SELECT 'website' AS type,w.id,w.status,w.reason_code,w.created_at,w.updated_at,w.evaluation_id,e.title AS evaluation_title,s.title AS subject,NULL::int AS done,NULL::int AS total
        FROM evals.website_source_job w JOIN evals.source s ON (s.org_id,s.id)=(w.org_id,w.source_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(w.org_id,w.evaluation_id)
        WHERE w.org_id=$1 AND (w.status NOT IN ('completed','failed') OR w.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'document',j.id,j.status,j.reason_code,j.created_at,j.updated_at,s.evaluation_id,e.title,s.title,NULL,NULL
        FROM evals.source_ingestion_job j JOIN evals.source s ON (s.org_id,s.id)=(j.org_id,j.source_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(s.org_id,s.evaluation_id)
        WHERE j.org_id=$1 AND NOT EXISTS (SELECT 1 FROM evals.website_source_job w WHERE w.org_id=j.org_id AND w.source_id=j.source_id)
          AND (j.status NOT IN ('completed','failed') OR j.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'generation',g.id,g.status,g.reason_code,g.created_at,g.updated_at,g.evaluation_id,e.title,g.title,NULL,NULL
        FROM evals.generation_job g JOIN evals.evaluation e ON (e.org_id,e.id)=(g.org_id,g.evaluation_id)
        WHERE g.org_id=$1 AND (g.status IN ('profiling','profile_ready','drafting','draft_ready') OR g.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'run',r.id,r.status,r.reason_code,r.created_at,r.updated_at,r.evaluation_id,e.title,NULL,
          (SELECT count(*)::int FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id AND u.status NOT IN ('pending','queued','running')),
          (SELECT count(*)::int FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id)
        FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
        WHERE r.org_id=$1 AND (r.status IN ('queued','running','pause_requested','paused','cancel_requested') OR r.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'export',x.id,x.status,x.reason_code,x.created_at,x.updated_at,r.evaluation_id,e.title,x.kind,NULL,NULL
        FROM evals.export_job x JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(x.org_id,x.report_revision_id)
        JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
        WHERE x.org_id=$1 AND (x.status IN ('queued','running') OR x.updated_at>now()-interval '3 days')
    ) jobs
    ORDER BY (status IN ('queued','running','profiling','profile_ready','drafting','draft_ready','captured','persisting','extracting','pause_requested','cancel_requested')) DESC, updated_at DESC
    LIMIT 60`, [scope.orgId])).rows);
}
