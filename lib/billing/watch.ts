/**
 * The billing watch (launch L-15, spec v2 §6.10, §6.12), run by the evals
 * scheduler every minute for each workspace while BILLING_CREDITS_ENABLED:
 *
 * 1. Cap watch, where credits are enforced (BILLING_ENFORCE or the
 *    workspace's override) and the workspace is not on a contract: once this
 *    month's usage plus open holds reaches the monthly cap, every queued or
 *    running run pauses with `cap_reached`; a run whose own spend reaches its
 *    per-run cap (2 × p90 by default) pauses the same way. Grading and report
 *    passes already under way finish (results are never held back), and
 *    test-set preparation is not stopped. Overshoot is bounded by the calls in
 *    flight in that minute: each holds at most its token bound. A scheduled
 *    run also pauses once its schedule's runs reach the schedule's monthly
 *    credit cap (launch L-18, lib/evals/monitoring/schedule-credits.ts).
 *
 * 2. Alerts, only where the billing screens show (lib/billing/billing-ui.ts)
 *    and the account ever had credits: balance below the low-balance threshold
 *    (once per refill), the monthly cap at 50, 80 and 100 % (once each per
 *    month), credits expiring in 30 and 7 days (once each per lot; the monthly
 *    allowance is left out), unusual spend (yesterday above 3 × the 4-week
 *    daily average, once per day) and a successful auto-recharge. The
 *    low-balance threshold is the owner's own when set (Limits and alerts,
 *    migration 112), else 500 credits or 20 % of the last pack. Each is
 *    claimed once in billing.alert_state, written as an
 *    in-app notice, and emailed with L-07's templates to owners who keep
 *    billing email on (evals.notification_email_recipients), each in their
 *    language. Stripe test mode emails only Caudals' own addresses.
 *
 * Runs as the scheduler's service identity under the web runtime role.
 */
import type { Pool, PoolClient } from "pg";
import { withTenant } from "@/lib/evals/repositories/db";
import { emailAppUrl } from "@/lib/email/links";
import { renderEmail, type TemplateName, type TemplateProps } from "@/lib/email/templates";
import type { SendEmail } from "@/lib/evals/operations/notifications";
import { pauseWorkflowForCredits } from "../evals/queue/credit-pause";
import { everFunded, lowBalanceThresholdUcr, monthWindow, readAccount, runSpendUcr, usageTotals, expiringLots } from "./account-view";
import { billingUiEligible } from "./billing-ui";
import { billingCreditsEnabled } from "./config";
import { billingEmailAllowed } from "./emails";
import { admissionRequirementUcr, engineBillingMode, workspaceEngineMode, type EngineBillingMode } from "./engine";
import { monthCommittedUcr, readSpendCaps, runCapUcr, type SpendCaps } from "./limits";
import { claimAlert, markAlertSent } from "./payments";
import { UCR_PER_CREDIT } from "./units";
import { scheduleCaps, scheduleMonthSpendUcr } from "../evals/monitoring/schedule-credits";

type Env = Record<string, string | undefined>;
type Scope = { orgId: string; actorId: string };
const ZERO = BigInt(0);
const DAY = 86_400_000;

export interface WatchDeps { processMode?: EngineBillingMode; env?: Env; send?: SendEmail | null; now?: Date; pool?: Pool }
export interface WatchTick { paused: number; alerts: string[] }

/** Whole credits, rounded down (a balance is never overstated). */
const credits = (ucr: bigint) => Number((ucr < ZERO ? ZERO : ucr) / UCR_PER_CREDIT);

/* ------------------------------------------------------------ cap watch --- */

/** The p90 per run, computed once per run per process (a run's estimate does not change while it runs). */
const runP90 = new Map<string, bigint>();
async function p90For(db: PoolClient, orgId: string, run: { id: string; evaluation_id: string; suite_version_id: string; target_revision_id: string }) {
  const known = runP90.get(run.id);
  if (known !== undefined) return known;
  const { p90Ucr } = await admissionRequirementUcr(db, orgId, { evaluationId: run.evaluation_id, suiteVersionId: run.suite_version_id, targetRevisionId: run.target_revision_id });
  if (runP90.size > 2000) runP90.clear();
  runP90.set(run.id, p90Ucr);
  return p90Ucr;
}

type ActiveRun = { id: string; workflow_id: string; evaluation_id: string; suite_version_id: string; target_revision_id: string };

async function activeRuns(db: PoolClient, orgId: string): Promise<ActiveRun[]> {
  return (await db.query(`SELECT r.id, w.id AS workflow_id, r.evaluation_id, r.suite_version_id, r.target_revision_id
    FROM evals.run r JOIN evals.execution_workflow w ON w.org_id = r.org_id AND w.run_id = r.id
    WHERE r.org_id=$1 AND r.status IN ('queued','running') AND w.status IN ('queued','running')
    ORDER BY r.created_at LIMIT 50`, [orgId])).rows as ActiveRun[];
}

type CapStop = { runId: string; workflowId: string; scope: "monthly" | "run" | "schedule"; capUcr: bigint; scheduleId?: string };

/** Pauses the runs a cap stops; returns which runs (and for which cap). */
async function capWatch(scope: Scope, caps: SpendCaps, committedUcr: bigint, deps: WatchDeps, now: Date): Promise<CapStop[]> {
  const stops: CapStop[] = [];
  await withTenant(scope, async db => {
    const runs = await activeRuns(db, scope.orgId);
    if (!runs.length) return;
    if (caps.monthlyUcr !== null && committedUcr >= caps.monthlyUcr) {
      for (const run of runs) stops.push({ runId: run.id, workflowId: run.workflow_id, scope: "monthly", capUcr: caps.monthlyUcr });
      return;
    }
    // Launch L-18: a scheduled run stops once its schedule's runs reach the schedule's monthly cap.
    const scheduled = new Map((await db.query("SELECT run_id,schedule_id FROM evals.schedule_dispatch WHERE org_id=$1 AND run_id=ANY($2::uuid[])",
      [scope.orgId, runs.map(run => run.id)])).rows.map(row => [String(row.run_id), String(row.schedule_id)]));
    const scheduleCap = await scheduleCaps(db, scope.orgId, [...new Set(scheduled.values())]);
    const scheduleSpent = new Map<string, bigint>();
    for (const run of runs) {
      const scheduleId = scheduled.get(run.id);
      const cap = scheduleId ? scheduleCap.get(scheduleId) : undefined;
      if (scheduleId && cap !== undefined) {
        if (!scheduleSpent.has(scheduleId)) scheduleSpent.set(scheduleId, await scheduleMonthSpendUcr(db, scope.orgId, scheduleId, now));
        if (scheduleSpent.get(scheduleId)! >= cap) { stops.push({ runId: run.id, workflowId: run.workflow_id, scope: "schedule", capUcr: cap, scheduleId }); continue; }
      }
      let p90: bigint;
      try { p90 = await p90For(db, scope.orgId, run); } catch { continue; }
      const runCap = runCapUcr(caps, p90);
      if (runCap > ZERO && await runSpendUcr(db, scope.orgId, run.id) >= runCap) stops.push({ runId: run.id, workflowId: run.workflow_id, scope: "run", capUcr: runCap });
    }
  }, deps.pool);
  for (const stop of stops) {
    await withTenant(scope, db => pauseWorkflowForCredits(db, scope.orgId, stop.workflowId, "cap_reached"), deps.pool);
    console.info(JSON.stringify({ event: "billing_cap_reached", org: scope.orgId, run: stop.runId, scope: stop.scope }));
  }
  return stops;
}

/* --------------------------------------------------------------- alerts --- */

type AlertKind = "low_balance" | "cap_reached" | "credits_expiring" | "unusual_spend" | "auto_recharge_succeeded" | "schedule_skipped";
export interface AlertEmail<T extends TemplateName> { template: T; props: (workspace: string) => TemplateProps[T] }

/**
 * Claims one alert, writes its in-app notice and emails the owners who keep
 * billing email on. A failed email leaves the alert unsent for the next tick
 * (three attempts in all); the notice and Resend's idempotency key keep a
 * retry from duplicating anything.
 */
export async function deliverBillingAlert<T extends TemplateName>(scope: Scope, kind: AlertKind, periodKey: string, payload: Record<string, unknown>,
  email: AlertEmail<T> | null, deps: WatchDeps): Promise<boolean> {
  const env = deps.env ?? process.env;
  const claimed = await withTenant(scope, async db => {
    if (!(await claimAlert(db, scope.orgId, kind, periodKey, payload))) return null;
    await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
      VALUES($1,$2,$3,'workspace',$4,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING`,
    [scope.orgId, `billing:${kind}:${periodKey}`, kind, payload]);
    if (!email || !deps.send) return { recipients: [] as Array<{ user_id: string; email: string; locale: string }>, workspace: "" };
    const recipients = (await db.query<{ user_id: string; email: string; locale: string }>(
      "SELECT user_id,email,locale FROM evals.notification_email_recipients($1,$2)", [scope.orgId, kind])).rows;
    const workspace = String((await db.query("SELECT billing.workspace_label($1) AS name", [scope.orgId])).rows[0]?.name ?? "Caudals");
    return { recipients, workspace };
  }, deps.pool);
  if (!claimed) return false;
  if (email && deps.send) {
    for (const recipient of claimed.recipients) {
      if (!billingEmailAllowed(recipient.email, env)) {
        console.info(JSON.stringify({ event: "billing_email_skipped", kind, reason: "test_mode_recipient" }));
        continue;
      }
      const rendered = renderEmail(email.template, recipient.locale === "es" ? "es" : "en", email.props(claimed.workspace));
      try {
        await deps.send({ to: recipient.email, subject: rendered.subject, text: rendered.text, html: rendered.html,
          idempotencyKey: `billing-${kind}:${scope.orgId}:${periodKey}:${recipient.user_id}`.slice(0, 256) });
      } catch {
        console.error(JSON.stringify({ event: "billing_alert_email_failed", kind, org: scope.orgId }));
        return true;
      }
    }
  }
  await withTenant(scope, db => markAlertSent(db, scope.orgId, kind, periodKey), deps.pool);
  return true;
}

/** Settings links for billing alerts: top-up, limits, usage, overview and the notification settings. */
export function billingLinks(orgId: string, env: Env = process.env) {
  const base = `${emailAppUrl(env)}/workspace/settings?orgId=${encodeURIComponent(orgId)}`;
  return { topUp: `${base}&tab=billing&view=top-up`, limits: `${base}&tab=billing&view=limits`, usage: `${base}&tab=billing&view=usage`, overview: `${base}&tab=billing`, notifications: `${base}&tab=notifications` };
}

const deliver = deliverBillingAlert;

/** The most recent entry that added credits: low-balance alerts fire once per refill. */
async function lastRefill(db: PoolClient, orgId: string): Promise<string | null> {
  const row = (await db.query(`SELECT id FROM billing.ledger_entry WHERE org_id=$1 AND amount_ucr > 0
    AND entry_type IN ('purchase','grant','allowance','bonus','adjustment') ORDER BY account_version DESC LIMIT 1`, [orgId])).rows[0];
  return row ? String(row.id) : null;
}

/** One workspace's watch. Never throws for one failing alert; the scheduler logs the tick. */
export async function runBillingWatch(scope: Scope, deps: WatchDeps = {}): Promise<WatchTick> {
  const env = deps.env ?? process.env;
  const tick: WatchTick = { paused: 0, alerts: [] };
  const processMode = deps.processMode ?? engineBillingMode(env);
  if (!billingCreditsEnabled(env) || processMode === "off") return tick;
  const now = deps.now ?? new Date();
  const state = await withTenant(scope, async db => {
    const account = await readAccount(db, scope.orgId);
    if (!account || account.billingMode === "contract") return null;
    const mode = await workspaceEngineMode(db, processMode, scope.orgId);
    const caps = await readSpendCaps(db, scope.orgId);
    const committed = await monthCommittedUcr(db, scope.orgId, account.heldUcr, now);
    const eligible = await billingUiEligible(db, scope.orgId, env) && await everFunded(db, scope.orgId);
    return { account, mode, caps, committed, eligible };
  }, deps.pool);
  if (!state) return tick;
  const url = billingLinks(scope.orgId, env);

  if (state.mode === "enforce") {
    const stops = await capWatch(scope, state.caps, state.committed, deps, now);
    tick.paused = stops.length;
    for (const stop of stops.filter(item => item.scope === "run")) {
      if (state.eligible && await deliver(scope, "cap_reached", `run:${stop.runId}`, { scope: "run", cap: credits(stop.capUcr), percent: 100, runId: stop.runId },
        { template: "cap_reached", props: workspace => ({ workspace, cap: credits(stop.capUcr), percent: 100, scope: "run", limitsUrl: url.limits, settingsUrl: url.notifications }) }, deps)) {
        tick.alerts.push("cap_reached:run");
      }
    }
    // A schedule's cap: once per schedule and month, whatever the number of runs it stopped.
    for (const stop of stops.filter(item => item.scope === "schedule")) {
      if (await deliver(scope, "cap_reached", `schedule:${stop.scheduleId}:${monthWindow(now).period}`, { scope: "schedule", cap: credits(stop.capUcr), percent: 100, runId: stop.runId, scheduleId: stop.scheduleId },
        { template: "cap_reached", props: workspace => ({ workspace, cap: credits(stop.capUcr), percent: 100, scope: "schedule", limitsUrl: url.limits, settingsUrl: url.notifications }) }, deps)) {
        tick.alerts.push("cap_reached:schedule");
      }
    }
  }
  if (!state.eligible) return tick;

  // The monthly cap at 50, 80 and 100 %: the highest step reached is sent; lower ones are marked as passed.
  if (state.caps.monthlyUcr !== null && state.caps.monthlyUcr > ZERO) {
    const cap = state.caps.monthlyUcr;
    const period = monthWindow(now).period;
    const reached = ([100, 80, 50] as const).find(step => state.committed * BigInt(100) >= cap * BigInt(step));
    if (reached) {
      const sent = await deliver(scope, "cap_reached", `${period}:${reached}`, { scope: "monthly", cap: credits(cap), percent: reached, used: credits(state.committed) },
        { template: "cap_reached", props: workspace => ({ workspace, cap: credits(cap), percent: reached, scope: "monthly", limitsUrl: url.limits, settingsUrl: url.notifications }) }, deps);
      if (sent) {
        tick.alerts.push(`cap_reached:${reached}`);
        for (const lower of [50, 80].filter(step => step < reached)) {
          await withTenant(scope, async db => { if (await claimAlert(db, scope.orgId, "cap_reached", `${period}:${lower}`, { skipped: true })) await markAlertSent(db, scope.orgId, "cap_reached", `${period}:${lower}`); }, deps.pool);
        }
      }
    }
  }

  const facts = await withTenant(scope, async db => ({
    threshold: await lowBalanceThresholdUcr(db, scope.orgId),
    refill: await lastRefill(db, scope.orgId),
    expiring: (await expiringLots(db, scope.orgId, new Date(now.getTime() + 30 * DAY))).filter(lot => lot.source !== "allowance" && lot.source !== "contract_allowance" && lot.ucr >= UCR_PER_CREDIT),
    recharges: (await db.query(`SELECT id,gross_cents,base_ucr + coalesce(bonus_ucr,0) AS credits FROM billing.top_up_order
      WHERE org_id=$1 AND kind='auto_recharge' AND status='paid' AND paid_at > $2 ORDER BY paid_at LIMIT 5`, [scope.orgId, new Date(now.getTime() - 3 * DAY)])).rows,
    autoThreshold: (await db.query("SELECT threshold_ucr FROM billing.auto_recharge WHERE org_id=$1", [scope.orgId])).rows[0]?.threshold_ucr ?? null,
    yesterday: now.getUTCHours() >= 1 ? await usageTotals(db, scope.orgId, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))) : null,
    month: now.getUTCHours() >= 1 ? await usageTotals(db, scope.orgId, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))) : null,
  }), deps.pool);

  const balance = state.account.availableUcr;
  if (facts.refill && balance < facts.threshold) {
    if (await deliver(scope, "low_balance", facts.refill, { balance: credits(balance), threshold: credits(facts.threshold) },
      { template: "low_balance", props: workspace => ({ workspace, balance: credits(balance), threshold: credits(facts.threshold), topUpUrl: url.topUp, settingsUrl: url.notifications }) }, deps)) {
      tick.alerts.push("low_balance");
    }
  }

  for (const lot of facts.expiring) {
    const days = (lot.at.getTime() - now.getTime()) / DAY;
    const step = days <= 7 ? 7 : 30;
    if (await deliver(scope, "credits_expiring", `lot:${lot.lotId}:${step}`, { credits: credits(lot.ucr), expiresAt: lot.at.toISOString(), days: step },
      { template: "credits_expiring", props: workspace => ({ workspace, credits: credits(lot.ucr), expiresAt: lot.at.toISOString(), workspaceUrl: url.overview, settingsUrl: url.notifications }) }, deps)) {
      tick.alerts.push(`credits_expiring:${step}`);
    }
  }

  for (const order of facts.recharges) {
    if (await deliver(scope, "auto_recharge_succeeded", String(order.id), { orderId: String(order.id), credits: credits(BigInt(order.credits)), amountCents: Number(order.gross_cents) },
      { template: "auto_recharge_succeeded", props: workspace => ({ workspace, amountCents: Number(order.gross_cents), currency: "EUR", credits: credits(BigInt(order.credits)),
        threshold: credits(facts.autoThreshold === null ? ZERO : BigInt(facts.autoThreshold)), balance: credits(balance), billingUrl: url.overview, settingsUrl: url.notifications }) }, deps)) {
      tick.alerts.push("auto_recharge_succeeded");
    }
  }

  // Unusual spend: yesterday above 3 × the daily average of the 28 days before, and at least 100 credits.
  if (facts.yesterday && facts.month && facts.yesterday.netUcr >= BigInt(100) * UCR_PER_CREDIT) {
    const average = facts.month.netUcr / BigInt(28);
    if (average > ZERO && facts.yesterday.netUcr > average * BigInt(3)) {
      const day = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
      const spent = credits(facts.yesterday.netUcr), usual = credits(average);
      if (await deliver(scope, "unusual_spend", day, { day, credits: spent, average: usual },
        { template: "unusual_spend", props: workspace => ({ workspace, day, credits: spent, average: usual, usageUrl: url.usage, settingsUrl: url.notifications }) }, deps)) {
        tick.alerts.push("unusual_spend");
      }
    }
  }
  return tick;
}
