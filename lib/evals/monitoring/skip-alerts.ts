/**
 * The alert for a scheduled run skipped for credits or a credit limit (launch
 * L-18, spec v2 P-24, §6.10): one in-app notice (billing category: owners and
 * editors) and one email to each owner who keeps billing email on, in their
 * language (L-07's branded template `schedule_skipped`), per skipped slot.
 * Claimed once in billing.alert_state (kind `schedule_skipped`, the dispatch
 * id), so a replayed tick never alerts twice; a failed email is retried by
 * the next ticks, three attempts in all. Stripe test mode emails only
 * Caudals' own addresses (lib/billing/emails.ts).
 *
 * No React and no "server-only": the scheduler imports it.
 */
import type { Pool } from "pg";
import { withTenant } from "../repositories/db";
import type { SendEmail } from "../operations/notifications";
import { billingLinks, deliverBillingAlert } from "../../billing/watch";
import { creditsDown, creditsUp, type ScheduleAdmission } from "./schedule-credits";

type Env = Record<string, string | undefined>;
type Scope = { orgId: string; actorId: string };
export const SKIP_ALERT_REASONS = ["credits_exhausted", "cap_reached"] as const;

export interface SkipAlertDeps { send?: SendEmail | null; env?: Env; pool?: Pool }

/** Sends the alert for one skipped dispatch (if it has not been sent). True when this call claimed it. */
export async function alertScheduleSkipped(scope: Scope, dispatchId: string, deps: SkipAlertDeps = {}): Promise<boolean> {
  const row = await withTenant(scope, async db => (await db.query(`SELECT d.id,d.schedule_id,d.scheduled_for,d.reason_code,d.admission,
      s.evaluation_id,s.next_due_at,s.status AS schedule_status,e.title AS evaluation_title
    FROM evals.schedule_dispatch d JOIN evals.monitor_schedule s ON (s.org_id,s.id)=(d.org_id,d.schedule_id)
    JOIN evals.evaluation e ON (e.org_id,e.id)=(s.org_id,s.evaluation_id)
    WHERE d.org_id=$1 AND d.id=$2 AND d.status='skipped' AND d.reason_code=ANY($3::text[])`, [scope.orgId, dispatchId, [...SKIP_ALERT_REASONS]])).rows[0], deps.pool);
  if (!row) return false;
  const admission = (row.admission ?? null) as ScheduleAdmission | null;
  const credits = row.reason_code === "credits_exhausted";
  const url = billingLinks(scope.orgId, deps.env ?? process.env);
  const needed = creditsUp(admission?.p90Ucr) ?? 0, available = creditsDown(admission?.availableUcr) ?? 0;
  const capScope = credits ? null : admission?.capScope ?? "schedule";
  const cap = capScope === "schedule" ? creditsDown(admission?.scheduleCapUcr) : null;
  const scheduledFor = new Date(row.scheduled_for).toISOString();
  const nextRunAt = row.schedule_status === "active" ? new Date(row.next_due_at).toISOString() : null;
  const payload = {
    reason: row.reason_code, capScope, needed, available, cap, scheduleId: String(row.schedule_id), dispatchId,
    evaluationId: String(row.evaluation_id), evaluationTitle: String(row.evaluation_title ?? ""), scheduledFor, nextRunAt,
  };
  return deliverBillingAlert(scope, "schedule_skipped", dispatchId, payload, {
    template: "schedule_skipped",
    props: workspace => ({
      workspace, evaluation: payload.evaluationTitle, scheduledFor, reason: credits ? "credits" : "cap", capScope, needed, available, cap, nextRunAt,
      actionUrl: credits ? url.topUp : url.limits, settingsUrl: url.notifications,
    }),
  }, { send: deps.send ?? null, env: deps.env, pool: deps.pool });
}

/**
 * Alerts for the last day's skipped slots that have not been alerted yet
 * (including retries after a failed email). Run by the schedule tick.
 */
export async function tickSkipAlerts(scope: Scope, deps: SkipAlertDeps = {}): Promise<number> {
  const ids = await withTenant(scope, async db => (await db.query(`SELECT d.id FROM evals.schedule_dispatch d
    WHERE d.org_id=$1 AND d.status='skipped' AND d.reason_code=ANY($2::text[]) AND d.updated_at > now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM billing.alert_state a WHERE a.org_id=d.org_id AND a.kind='schedule_skipped' AND a.period_key=d.id::text
        AND (a.sent_at IS NOT NULL OR a.attempts >= 3))
    ORDER BY d.updated_at, d.id LIMIT 20`, [scope.orgId, [...SKIP_ALERT_REASONS]])).rows.map(item => String(item.id)), deps.pool);
  let sent = 0;
  for (const id of ids) if (await alertScheduleSkipped(scope, id, deps)) sent++;
  return sent;
}
