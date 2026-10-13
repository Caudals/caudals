import "server-only";
import type { PoolClient } from "pg";
import { analyticsV2Enabled, recordProductEvent } from "./funnel-events-server";
import type { ProductEventPayload, ServerEventName } from "./events";
type Scope = { orgId: string; actorId: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Runs only on the first successful idempotent domain write, in its transaction. */
export async function recordDomainCreation(db: PoolClient, scope: Scope, route: string, input: unknown, response: unknown) {
  if (!analyticsV2Enabled()) return;
  const data = object(response), args = object(input);
  let eventName: ServerEventName | undefined, payload: ProductEventPayload = {}, runId: string | undefined;
  const resource = String(data.id ?? data.runId ?? data.suiteVersionId ?? data.sourceId ?? "");
  if (route === "evaluations" || route === "self-service-evaluations") { eventName = "evaluation_created"; payload = { connection_kind: args.targetId ? "website" : "unconfigured" }; }
  else if ((["runs", "self-service-runs"].includes(route) || route.startsWith("graded-results/"))) { eventName = "run_started"; runId = resource; payload = { questions: typeof data.units === "number" ? data.units : typeof data.cases === "number" ? data.cases : null, models: null }; }
  else if (route.startsWith("freeze/") || route.startsWith("evaluation-generation/")) { eventName = "test_set_ready"; const manifest = object(data.manifest); payload = { question_count: Array.isArray(manifest.case_revisions) ? manifest.case_revisions.length : null }; }
  else if (route === "monitor-schedules") { eventName = "schedule_created"; payload = { destination_type: "scheduled_run" }; }
  else if ((route === "uploads" && !data.duplicate) || route.startsWith("website-source/")) {
    // Launch L-34: an imported help centre is one website source of the selected pages; a duplicate file adds nothing.
    eventName = "sources_added"; payload = { source_kind: route === "uploads" ? "file" : object(args.import).previewId ? "help_centre" : "website", count: 1 };
  }
  if (!eventName || !resource) return;
  await db.query("SAVEPOINT analytics_dimensions");
  try {
    if (eventName === "run_started") {
      const row = (await db.query(`SELECT
        (SELECT count(*)::int FROM evals.case_unit WHERE org_id=$1 AND run_id=$2) AS questions,
        (SELECT count(DISTINCT route->>'model_id')::int FROM jsonb_each(COALESCE(r.model_routes,'{}'::jsonb)) AS models(role,route)) AS models
        FROM evals.run r WHERE org_id=$1 AND id=$2`, [scope.orgId, resource])).rows[0];
      if (row) payload = { ...payload, questions: row.questions, models: row.models, estimate: null };
    }
    if (eventName === "test_set_ready") {
      const jobId = object(args.generation).generationJobId;
      const row = typeof jobId === "string"
        ? (await db.query("SELECT extract(epoch from (now()-created_at))::float8 AS seconds FROM evals.generation_job WHERE org_id=$1 AND id=$2", [scope.orgId,jobId])).rows[0]
        : (await db.query("SELECT extract(epoch from (now()-created_at))::float8 AS seconds FROM evals.suite WHERE org_id=$1 AND id=$2", [scope.orgId,route.startsWith("freeze/") ? route.slice(7) : data.suiteId])).rows[0];
      payload.duration_s = row ? Math.max(0,row.seconds) : null;
    }
    await db.query("RELEASE SAVEPOINT analytics_dimensions");
  } catch { await db.query("ROLLBACK TO SAVEPOINT analytics_dimensions"); await db.query("RELEASE SAVEPOINT analytics_dimensions"); console.error("analytics_dimensions_failed"); }
  await recordProductEvent({ eventName, source: "server", orgId: scope.orgId, runId, eventKey: `${scope.orgId}:${resource}`, payload }, db);
}
/** Emitted only after grading/reporting, not when target execution alone finishes. */
export async function recordRunFinished(db: PoolClient, orgId: string, runId: string) {
  if (!analyticsV2Enabled()) return;
  await db.query("SAVEPOINT analytics_run_outcome");
  try {
    const row = (await db.query(`SELECT status,phase,extract(epoch from (updated_at-created_at))::float8 AS duration,
      (SELECT count(*)::int FROM evals.case_unit WHERE org_id=$1 AND run_id=$2) AS questions,
      (SELECT count(DISTINCT route->>'model_id')::int FROM jsonb_each(COALESCE(r.model_routes,'{}'::jsonb)) AS models(role,route)) AS models
      FROM evals.run r WHERE org_id=$1 AND id=$2`, [orgId, runId])).rows[0];
    if (row && (row.phase === "done" || row.status === "canceled")) await recordProductEvent({ eventName: "run_finished", source: "server", orgId, runId, eventKey: runId, payload: { outcome: row.status, questions: row.questions, duration_s: Math.max(0, row.duration), models: row.models, estimate: null, credits_charged: null } }, db);
    await db.query("RELEASE SAVEPOINT analytics_run_outcome");
  } catch { await db.query("ROLLBACK TO SAVEPOINT analytics_run_outcome"); await db.query("RELEASE SAVEPOINT analytics_run_outcome"); console.error("analytics_run_outcome_failed"); }
}
