/**
 * Where a scheduled run's summary goes (launch L-18, spec v2 P-25).
 *
 * After each scheduled run is judged (lib/evals/monitoring/alerts.ts), its
 * summary (score against last time, newly broken questions, "not
 * comparable") is handed to every destination inside the transaction that
 * records the alert, so a destination only enqueues: nothing here calls the
 * network, and the alert's unique row keeps every delivery to one per run.
 *
 *   in-app   one notice per run (`monitor_<status>`), shown in the
 *            notification centre to members who keep that category on. A
 *            regression notice is also emailed (the branded EN/ES template)
 *            to members who keep the regressions email category on
 *            (lib/evals/operations/notifications.ts).
 *   webhook  the signed webhook event (WP-13), unchanged.
 *
 * Launch L-19 adds Slack and Microsoft Teams (and email destinations) by
 * registering a destination: `registerSummaryDestination({ kind, deliver })`.
 * Its `deliver` receives the same summary and enqueues its own delivery rows
 * (./integration-destinations.ts: one webhook_delivery per Slack, Teams or
 * email destination, formatted and sent by the scheduler's webhook tick).
 */
import type { PoolClient } from "pg";
import type { WebhookEventKind } from "./customer-api";
import type { MonitoringSummary } from "./summary";
import { queueWebhookEvent } from "./webhooks";

export type SummaryDelivery = { orgId: string; alertId: string; eventId: string; summary: MonitoringSummary; webhookEvent: WebhookEventKind; webhookPayload: Record<string, unknown> };
export interface SummaryDestination {
  readonly kind: string;
  deliver(db: PoolClient, delivery: SummaryDelivery): Promise<void>;
}

/** The in-app notice: compact, so the notification centre can show the score and the newly broken questions. */
export function noticePayload(delivery: SummaryDelivery) {
  const s = delivery.summary;
  return {
    alert_id: delivery.alertId, run_id: s.candidate.runId, schedule_dispatch_id: s.dispatchId, status: s.status, reason_codes: s.reasons,
    evaluationId: s.evaluation.id, evaluationTitle: s.evaluation.title, reportId: s.candidate.reportId, scheduledFor: s.scheduledFor,
    comparable: s.comparable, pass: s.candidate.score.pass, scored: s.candidate.score.scored,
    previousPass: s.baseline?.score.pass ?? null, previousScored: s.baseline?.score.scored ?? null,
    brokenTotal: s.newlyBrokenTotal, fixedTotal: s.fixedTotal,
    broken: s.newlyBroken.map(item => ({ title: item.title.slice(0, 200), assessmentId: item.assessmentId, before: item.before, after: item.after })),
  };
}

const inApp: SummaryDestination = {
  kind: "in_app",
  async deliver(db, delivery) {
    await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
      VALUES($1,$2,$3,'workspace',$4,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING`,
    [delivery.orgId, delivery.eventId, `monitor_${delivery.summary.status}`, noticePayload(delivery)]);
  },
};

const webhook: SummaryDestination = {
  kind: "webhook",
  async deliver(db, delivery) {
    await queueWebhookEvent(db, delivery.orgId, delivery.eventId, delivery.webhookEvent, delivery.webhookPayload);
  },
};

const registered = new Map<string, SummaryDestination>();

/** L-19: adds a destination (Slack, Teams, …). A kind registers once; the built-in kinds cannot be replaced. */
export function registerSummaryDestination(destination: SummaryDestination) {
  if (destination.kind === inApp.kind || destination.kind === webhook.kind) throw new Error("summary_destination_reserved");
  registered.set(destination.kind, destination);
}

export function summaryDestinations(): SummaryDestination[] {
  return [inApp, webhook, ...registered.values()];
}

/** Hands one summary to every destination, in the caller's transaction. */
export async function deliverSummary(db: PoolClient, delivery: SummaryDelivery) {
  for (const destination of summaryDestinations()) await destination.deliver(db, delivery);
}
