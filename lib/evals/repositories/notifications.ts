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

export const notificationQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  unreadOnly: z.boolean().default(false),
  before: z.strictObject({ createdAt: z.iso.datetime(), id: z.uuid() }).optional(),
});

/** A stable, newest-first page; the badge counts every visible unread notice, not just this page. */
export function listNotifications(scope: EvidenceScope, raw: unknown = {}) {
  const input = notificationQuerySchema.parse(raw);
  return withTenant(scope, async (db) => {
    const preferences = (await db.query("SELECT completion,required_input,failure FROM evals.notification_preference WHERE org_id=$1 AND user_id=$2", [scope.orgId, scope.actorId])).rows[0]
      ?? { completion: true, required_input: true, failure: true };
    // Started events belong to Activity. Exclude them before pagination so they cannot crowd out results.
    const hidden = Object.entries(NOTICE_CATEGORY).filter(([, category]) => category === "progress" || !preferences[category]).map(([kind]) => kind);
    const visible = `FROM evals.notification n LEFT JOIN evals.notification_read r
      ON (r.org_id,r.notification_id)=(n.org_id,n.id) AND r.user_id=$2
      WHERE n.org_id=$1 AND n.audience='workspace' AND n.status<>'dismissed'
        AND n.created_at>now()-interval '30 days' AND NOT (n.kind=ANY($3::text[]))`;
    const params = [scope.orgId, scope.actorId, hidden];
    const unread = (await db.query(`SELECT count(*)::int AS unread ${visible} AND r.notification_id IS NULL`, params)).rows[0].unread as number;
    const rows = (await db.query(`SELECT n.id,n.kind,n.payload,n.created_at,(r.notification_id IS NOT NULL) AS read,
        to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      ${visible} AND ($4::boolean=false OR r.notification_id IS NULL)
        AND ($5::timestamptz IS NULL OR (n.created_at,n.id)<($5::timestamptz,$6::uuid))
      ORDER BY n.created_at DESC,n.id DESC LIMIT $7`,
      [...params, input.unreadOnly, input.before?.createdAt ?? null, input.before?.id ?? null, input.limit + 1])).rows;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      notifications: page.map(({ cursor_created_at, ...row }) => ({ ...row, created_at: cursor_created_at as string, category: NOTICE_CATEGORY[row.kind] ?? "completion" })),
      unread,
      // Keep PostgreSQL's microseconds in the cursor: JS Date truncation would skip notices.
      nextCursor: rows.length > input.limit && last ? { createdAt: last.cursor_created_at as string, id: last.id as string } : null,
    };
  });
}

export function markNotificationsRead(scope: EvidenceScope, raw: unknown) {
  const input = z.union([z.strictObject({ ids: z.array(z.uuid()).min(1).max(200) }), z.strictObject({ all: z.literal(true) })]).parse(raw);
  return withTenant(scope, async (db) => {
    const result = "all" in input
      ? await db.query(`INSERT INTO evals.notification_read(org_id,notification_id,user_id)
          SELECT org_id,id,$2 FROM evals.notification WHERE org_id=$1 AND audience='workspace' AND status<>'dismissed' AND created_at>now()-interval '30 days' ON CONFLICT DO NOTHING`, [scope.orgId, scope.actorId])
      : await db.query(`INSERT INTO evals.notification_read(org_id,notification_id,user_id)
          SELECT org_id,id,$2 FROM evals.notification WHERE org_id=$1 AND audience='workspace' AND status<>'dismissed' AND id=ANY($3::uuid[]) ON CONFLICT DO NOTHING`, [scope.orgId, scope.actorId, input.ids]);
    return { marked: result.rowCount ?? 0 };
  });
}

export type ActivityStage = "queued" | "reading" | "analysing" | "drafting" | "needs_input" | "asking" | "grading" | "reporting" | "exporting" | "paused" | "canceling" | "canceled" | "done" | "failed";
type ActivityRow = {
  type: "website" | "document" | "generation" | "run" | "export"; id: string; status: string; reason_code: string | null;
  created_at: string; updated_at: string; evaluation_id: string | null; evaluation_title: string | null; subject: string | null;
  done: number | null; total: number | null; phase: string | null; grading_done: number | null; grading_total: number | null;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
/**
 * One progress figure per job, 0–100, from durable state only (no timers):
 * runs weight asking the system 80%, grading 18% and the report 2%;
 * generation weights drafted tests over the requested count.
 */
export function jobProgress(row: Pick<ActivityRow, "type" | "status" | "done" | "total" | "phase" | "grading_done" | "grading_total">): { percent: number | null; stage: ActivityStage; active: boolean } {
  const share = (done: number | null, total: number | null) => (total ? Math.min(1, (done ?? 0) / total) : 0);
  if (row.status === "failed" || row.status === "quarantined") return { percent: null, stage: "failed", active: false };
  if (row.type === "website") {
    const steps: Record<string, number> = { queued: 5, running: 30, captured: 55, persisting: 70, extracting: 85, completed: 100 };
    return { percent: steps[row.status] ?? null, stage: row.status === "completed" ? "done" : row.status === "queued" ? "queued" : "reading", active: row.status !== "completed" };
  }
  if (row.type === "document" || row.type === "export") {
    const steps: Record<string, number> = { queued: 10, running: 50, completed: 100 };
    return { percent: steps[row.status] ?? null, stage: row.status === "completed" ? "done" : row.status === "queued" ? "queued" : row.type === "export" ? "exporting" : "reading", active: row.status !== "completed" };
  }
  if (row.type === "generation") {
    if (row.status === "needs_review") return { percent: 100, stage: "done", active: false };
    if (row.status === "needs_input") return { percent: 15, stage: "needs_input", active: false };
    if (row.status === "paused") return { percent: clamp(15 + 75 * share(row.done, row.total)), stage: "paused", active: false };
    if (row.status === "profiling" || row.status === "profile_ready") return { percent: row.status === "profiling" ? 8 : 15, stage: "analysing", active: true };
    if (row.status === "draft_ready") return { percent: 92, stage: "drafting", active: true };
    return { percent: clamp(15 + 75 * share(row.done, row.total)), stage: "drafting", active: true };
  }
  // run
  if (row.status === "canceled") return { percent: null, stage: "canceled", active: false };
  if (row.status === "cancel_requested") return { percent: null, stage: "canceling", active: true };
  if (row.status === "paused" || row.status === "pause_requested") return { percent: clamp(5 + 75 * share(row.done, row.total)), stage: "paused", active: false };
  if (row.status === "queued" || row.phase === "preflight") return { percent: 2, stage: "queued", active: true };
  if (row.phase === "target_execution") return { percent: clamp(5 + 75 * share(row.done, row.total)), stage: "asking", active: true };
  if (row.phase === "grading" || (row.phase === "reporting" && (row.grading_total ?? 0) > (row.grading_done ?? 0))) {
    return { percent: clamp(80 + 18 * (row.grading_total ? share(row.grading_done, row.grading_total) : 0)), stage: "grading", active: true };
  }
  if (row.phase === "reporting" || row.phase === "aggregation") return { percent: 98, stage: "reporting", active: true };
  return { percent: 100, stage: "done", active: false };
}

/** Queued, running and recently finished work, newest first, with progress where it is known. */
export function listActivity(scope: EvidenceScope) {
  return withTenant(scope, async (db) => (await db.query(`SELECT * FROM (
      SELECT 'website' AS type,w.id,w.status,w.reason_code,w.created_at,w.updated_at,w.evaluation_id,e.title AS evaluation_title,s.title AS subject,NULL::int AS done,NULL::int AS total,NULL::text AS phase,NULL::int AS grading_done,NULL::int AS grading_total
        FROM evals.website_source_job w JOIN evals.source s ON (s.org_id,s.id)=(w.org_id,w.source_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(w.org_id,w.evaluation_id)
        WHERE w.org_id=$1 AND (w.status NOT IN ('completed','failed') OR w.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'document',j.id,j.status,j.reason_code,j.created_at,j.updated_at,s.evaluation_id,e.title,s.title,NULL,NULL,NULL,NULL,NULL
        FROM evals.source_ingestion_job j JOIN evals.source s ON (s.org_id,s.id)=(j.org_id,j.source_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(s.org_id,s.evaluation_id)
        WHERE j.org_id=$1 AND NOT EXISTS (SELECT 1 FROM evals.website_source_job w WHERE w.org_id=j.org_id AND w.source_id=j.source_id)
          AND (j.status NOT IN ('completed','failed') OR j.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'generation',g.id,g.status,g.reason_code,g.created_at,g.updated_at,g.evaluation_id,e.title,g.title,jsonb_array_length(g.draft_cases),g.requested_case_count,NULL,NULL,NULL
        FROM evals.generation_job g JOIN evals.evaluation e ON (e.org_id,e.id)=(g.org_id,g.evaluation_id)
        WHERE g.org_id=$1 AND (g.status IN ('profiling','profile_ready','drafting','draft_ready') OR g.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'run',r.id,r.status,r.reason_code,r.created_at,r.updated_at,r.evaluation_id,e.title,NULL,
          (SELECT count(*)::int FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id AND u.status NOT IN ('pending','queued','running')),
          (SELECT count(*)::int FROM evals.case_unit u WHERE u.org_id=r.org_id AND u.run_id=r.id),
          -- A finished run left in grading/reporting with nothing queued is done for the reader.
          CASE WHEN r.status IN ('completed','partial') AND r.phase IN ('grading','reporting') AND r.updated_at<now()-interval '30 minutes'
            AND NOT EXISTS (SELECT 1 FROM evals.judge_job q WHERE q.org_id=r.org_id AND q.run_id=r.id AND q.status='queued') THEN 'done' ELSE r.phase END,
          (SELECT count(*) FILTER (WHERE j.status<>'queued')::int FROM evals.judge_job j WHERE j.org_id=r.org_id AND j.run_id=r.id),
          (SELECT count(*)::int FROM evals.judge_job j WHERE j.org_id=r.org_id AND j.run_id=r.id)
        FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
        WHERE r.org_id=$1 AND (r.status IN ('queued','running','pause_requested','paused','cancel_requested') OR r.updated_at>now()-interval '3 days')
      UNION ALL
      SELECT 'export',x.id,x.status,x.reason_code,x.created_at,x.updated_at,r.evaluation_id,e.title,x.kind,NULL,NULL,NULL,NULL,NULL
        FROM evals.export_job x JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(x.org_id,x.report_revision_id)
        JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id) LEFT JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
        WHERE x.org_id=$1 AND (x.status IN ('queued','running') OR x.updated_at>now()-interval '3 days')
    ) jobs
    ORDER BY updated_at DESC,created_at DESC,type,id DESC
    LIMIT 60`, [scope.orgId])).rows.map((row: ActivityRow) => ({ ...row, ...jobProgress(row) })));
}
