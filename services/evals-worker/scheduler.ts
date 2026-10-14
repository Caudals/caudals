import { z } from "zod";
import { writeFileSync } from "node:fs";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { workerWorkspaces } from "../../lib/evals/queue/workspaces";
import { loadKeyring } from "../../lib/evals/security/envelope";
import { tickSchedules } from "../../lib/evals/monitoring/schedules";
import { tickScheduledAlerts } from "../../lib/evals/monitoring/alerts";
import { tickWebhookDeliveries } from "../../lib/evals/monitoring/webhooks";
import { advanceJudgments } from "../../lib/evals/repositories/judging";
import { advanceReportNarratives } from "../../lib/evals/repositories/narratives";
import { finalizeRuns, refreshJudgedReports } from "../../lib/evals/repositories/finalize";
import { advanceEvaluationRestarts } from "../../lib/evals/repositories/evaluation-controls";
import { advancePendingGenerations } from "../../lib/evals/repositories/automatic-generation";
import { advanceOnboardingAutostarts, onboardingDueWorkspaces } from "../../lib/evals/repositories/onboarding";
import { tickLifecycle } from "../../lib/evals/operations/lifecycle";
import { queueRequiredInputNotifications, resendSender, tickEmailNotifications, type SendEmail } from "../../lib/evals/operations/notifications";
import { tickLifecycleEmails } from "../../lib/evals/operations/lifecycle-email";
import { billingCreditsEnabled } from "../../lib/billing/config";
import { engineBillingMode } from "../../lib/billing/engine";
import {
  billingExpiryDue, billingVerificationDue, previousUtcDay, priceBookUpkeepDue, runBillingExpiry, runBillingReconciler, runBillingVerification, runFxUpdate,
  runPriceBookActivation, runPriceCheck, runShadowAdmissions, runShadowReport, shadowReportDue,
} from "../../lib/billing/jobs";
import { digestLocale, digestRecipient, digestSender, digestWeek, opsDigestEnabled, runOpsDigest } from "../../lib/evals/operations/ops-digest";
import { captureServerError, flushErrors } from "../../lib/observability/capture";
import { initWorkerSentry } from "../../lib/observability/worker-sentry";
import { runAutoRecharge } from "../../lib/billing/auto-recharge";
import { runMonthlyAllowance } from "../../lib/billing/allowance";
import { runInvoicing } from "../../lib/billing/invoicing/jobs";
import { runBillingWatch } from "../../lib/billing/watch";
import { sectorPacksEnabled } from "../../lib/evals/sector-packs/flags";
import { advanceSourceRefreshes, monthlyQuestionsDue } from "../../lib/evals/sector-packs/refresh";

async function main() {
  initWorkerSentry("evals-scheduler");
  if (process.env.EVALS_SCHEDULES_ENABLED !== "true") throw new Error("schedules_disabled");
  z.enum(["production", "development"]).parse(process.env.EVALS_ENV);
  const orgs = workerWorkspaces(process.env.EVALS_WORKER_ORG_IDS);
  await orgs.refresh();
  const keyFile = z.string().min(1).parse(process.env.EVALS_WEBHOOK_KEYRING_FILE);
  const actorId = z.string().min(1).parse(process.env.EVALS_SCHEDULER_ACTOR_ID);
  const keys = loadKeyring(keyFile);
  // Email is optional: without a provider key the in-app notices still work.
  let send: SendEmail | null = null;
  if (process.env.RESEND_API_KEY_FILE || process.env.RESEND_API_KEY) {
    try { send = await resendSender(); } catch { console.error(JSON.stringify({ event: "email_sender_unavailable" })); }
  }
  let stopping = false;
  let lastTick = 0;
  let lastOnboardingTick = 0;
  let lastBillingVerify = 0;
  let lastBillingExpiry = 0;
  let lastPriceBook = 0;
  let lastLifecycleEmail = 0;
  let lastShadowReport = 0;
  let lastDigest = 0;
  let lastRefresh = 0;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.info(JSON.stringify({ event: "scheduler_ready", workspaces: orgs.current().length }));
  try {
    while (!stopping) {
      // First-run automatic starts (launch L-06, ONBOARDING_AUTOSTART) on a short
      // tick, so a new demo sign-up gets its test set started within a minute
      // even with no page open. Only workspaces with a pending start are read.
      if (Date.now() - lastOnboardingTick >= 10_000) {
        lastOnboardingTick = Date.now();
        try {
          for (const orgId of await onboardingDueWorkspaces(actorId)) {
            try {
              await advanceOnboardingAutostarts({ orgId, actorId });
            } catch (error) {
              console.error(JSON.stringify({ event: "scheduler_tick_failed", orgId, task: "onboarding" }));
              captureServerError(error, { service: "evals-scheduler", event: "scheduler_tick_failed", task: "onboarding", workspace: orgId });
            }
          }
        } catch (error) {
          console.error(JSON.stringify({ event: "onboarding_tick_failed" }));
          captureServerError(error, { service: "evals-scheduler", event: "onboarding_tick_failed" });
        }
      }
      if (Date.now() - lastTick >= 60_000) {
        lastTick = Date.now();
        let healthy = true;
        for (const orgId of await orgs.refresh()) {
          const scope = { orgId, actorId };
          // Each task runs on its own: one failing step (a bad generation job,
          // say) must not stop grading, reports or notifications for the workspace.
          const tasks: Array<[string, () => Promise<unknown>]> = [
            // Launch L-18: due slots are checked for credits; a skip for credits or a cap alerts owners.
            ["schedules", () => tickSchedules(scope, undefined, { send })],
            ["alerts", () => tickScheduledAlerts(scope)],
            ["webhooks", () => tickWebhookDeliveries(scope, keys)],
            ["restarts", () => advanceEvaluationRestarts(scope)],
            ["generations", () => advancePendingGenerations(scope)],
            ["judgments", () => advanceJudgments(scope)],
            ["narratives", () => advanceReportNarratives(scope)],
            ["finalize", () => finalizeRuns(scope)],
            ["reports", () => refreshJudgedReports(scope)],
            ["notifications", () => queueRequiredInputNotifications(scope)],
            // Shadow mode (L-11): what admission would require, recorded off the request
            // path, for workspaces in shadow mode (globally or by override, L-14).
            ["billing_admissions", () => runShadowAdmissions(scope, engineBillingMode())],
            // Spend caps where credits are enforced, and billing alerts where the
            // billing screens show (launch L-15); nothing while credits are off.
            ["billing_watch", async () => {
              const watch = await runBillingWatch(scope, { send });
              if (watch.paused || watch.alerts.length) console.info(JSON.stringify({ event: "billing_watch", orgId, paused: watch.paused, alerts: watch.alerts }));
            }],
          ];
          for (const [task, run] of tasks) {
            try {
              await run();
            } catch (error) {
              healthy = false;
              console.error(JSON.stringify({ event: "scheduler_tick_failed", orgId, task, reason: error instanceof Error && /^[a-z0-9_]{1,80}$/i.test(error.message) ? error.message : error instanceof Error ? error.name : "unknown" }));
              captureServerError(error, { service: "evals-scheduler", event: "scheduler_tick_failed", task, workspace: orgId });
            }
          }
        }
        // Retention and deletion cover every workspace, not only the dispatch allowlist.
        try {
          const lifecycle = await tickLifecycle(actorId);
          if (lifecycle.workspaces) console.info(JSON.stringify({ event: "lifecycle_tick", ...lifecycle }));
        } catch (error) {
          healthy = false;
          console.error(JSON.stringify({ event: "lifecycle_tick_failed" }));
          captureServerError(error, { service: "evals-scheduler", event: "lifecycle_tick_failed" });
        }
        if (send) {
          try {
            const email = await tickEmailNotifications(actorId, send);
            if (email.sent || email.failed) console.info(JSON.stringify({ event: "email_notifications", ...email }));
          } catch {
            console.error(JSON.stringify({ event: "email_notifications_failed" }));
          }
        }
        // Lifecycle email (launch L-07): off unless LIFECYCLE_EMAILS_ENABLED=true.
        // Every five minutes; a failure is logged, never a scheduler failure.
        if (send && Date.now() - lastLifecycleEmail >= 5 * 60_000) {
          lastLifecycleEmail = Date.now();
          try {
            const lifecycleEmail = await tickLifecycleEmails({ actorId, send });
            if (lifecycleEmail.sent || lifecycleEmail.failed || lifecycleEmail.skipped) console.info(JSON.stringify({ event: "lifecycle_email", ...lifecycleEmail }));
          } catch (error) {
            console.error(JSON.stringify({ event: "lifecycle_email_failed", reason: error instanceof Error && /^[a-z_]{1,60}$/.test(error.message) ? error.message : "unknown" }));
            captureServerError(error, { service: "evals-scheduler", event: "lifecycle_email_failed" });
          }
        }
        // Credit ledger (spec §6.9–§6.10). Platform-wide through SECURITY DEFINER
        // functions. Drift is reported, never a scheduler failure: the verifier
        // must keep running to say when it is fixed.
        if (billingVerificationDue(lastBillingVerify)) {
          lastBillingVerify = Date.now();
          try {
            const run = await runBillingVerification(actorId);
            const line = JSON.stringify({ event: run.driftAccounts ? "billing_drift" : "billing_verified", accounts: run.accounts, driftAccounts: run.driftAccounts, drift: run.drift.slice(0, 20) });
            if (run.driftAccounts) console.error(line); else console.info(line);
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_verify_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_verify_failed" });
          }
        }
        if (billingCreditsEnabled() && billingExpiryDue(lastBillingExpiry)) {
          lastBillingExpiry = Date.now();
          try {
            const expiry = await runBillingExpiry(actorId);
            if (expiry.accounts) console.info(JSON.stringify({ event: "billing_expiry", accounts: expiry.accounts, holds: expiry.holds, lots: expiry.lots, expiredUcr: expiry.expiredUcr.toString() }));
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_expiry_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_expiry_failed" });
          }
          // Engine hooks (§6.8): unknown-outcome shadow holds released after 24 h, failed runs refunded.
          try {
            const reconciled = await runBillingReconciler(actorId, engineBillingMode());
            if (reconciled.shadowExpired || reconciled.refunds || reconciled.shadowRefunds || reconciled.failed) console.info(JSON.stringify({ event: "billing_reconciled", ...reconciled }));
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_reconcile_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_reconcile_failed" });
          }
        }
        // Shadow week (§6.18): the daily diff of shadow credits against budget
        // reservations and recorded usage. Any mismatch is logged as an error.
        if (engineBillingMode() === "shadow" && shadowReportDue(lastShadowReport)) {
          lastShadowReport = Date.now();
          try {
            const shadow = await runShadowReport(actorId, previousUtcDay());
            const totals = (shadow.report.totals ?? {}) as Record<string, unknown>;
            const line = JSON.stringify({ event: shadow.mismatches ? "billing_shadow_mismatch" : "billing_shadow_report", day: shadow.day, mismatches: shadow.mismatches,
              checks: shadow.report.checks, holds: totals.holds, captures: totals.captures, releases: totals.releases, actions: totals.actions,
              admissions: totals.admissions, wouldBlock: Number(totals.holds_blocked ?? 0) + Number(totals.actions_blocked ?? 0) + Number(totals.admissions_blocked ?? 0),
              chargedUcr: totals.charged_ucr });
            if (shadow.mismatches) console.error(line); else console.info(line);
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_shadow_report_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_shadow_report_failed" });
          }
        }
        // Price book (spec §6.4): scheduled revisions take effect by date; the
        // labels follow hourly. Weekly provider-price check and monthly ECB FX
        // use free public sources; failures are logged, never fatal.
        if (priceBookUpkeepDue(lastPriceBook)) {
          lastPriceBook = Date.now();
          try {
            for (const revision of await runPriceBookActivation(actorId)) console.info(JSON.stringify({ event: "price_book_activated", revision: revision.revision }));
          } catch (error) {
            console.error(JSON.stringify({ event: "price_book_activation_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "price_book_activation_failed" });
          }
          try {
            const rate = await runFxUpdate(actorId);
            if (rate) console.info(JSON.stringify({ event: "billing_fx_recorded", date: rate.date, usdPerEur: rate.usdPerEur }));
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_fx_update_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_fx_update_failed" });
          }
          try {
            const report = await runPriceCheck(actorId);
            if (report) {
              // A listing change or a cost move above 3 % (price or FX) needs ops: log it as an alert.
              const recompute = report.changes.filter(change => change.recompute).map(change => change.label);
              const alert = report.changed > 0 || recompute.length > 0;
              const line = JSON.stringify({ event: alert ? "billing_price_check_changes" : "billing_price_check", revision: report.revision.revision,
                checked: report.checked, changed: report.changed, unavailable: report.unavailable, fxChange: report.fx?.change ?? null, recompute: recompute.slice(0, 20) });
              if (alert) console.error(line); else console.info(line);
            }
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_price_check_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_price_check_failed" });
          }
        }
        // Weekly ops digest (launch L-21, P-36): Monday 08:00 Madrid, to the
        // internal address only, claimed once per week in the database.
        if (opsDigestEnabled() && Date.now() - lastDigest >= 5 * 60_000 && digestWeek(new Date()).due) {
          lastDigest = Date.now();
          try {
            const outcome = await runOpsDigest({ actorId, send: await digestSender(), to: await digestRecipient(), locale: digestLocale(), appUrl: process.env.EVALS_APP_URL });
            if (outcome.status === "sent") console.info(JSON.stringify({ event: "ops_digest_sent", week: outcome.week, ...outcome.summary }));
            if (outcome.status === "failed") console.error(JSON.stringify({ event: "ops_digest_failed", week: outcome.week, reason: outcome.reason }));
          } catch (error) {
            console.error(JSON.stringify({ event: "ops_digest_failed", reason: error instanceof Error && /^[a-z_]{1,40}$/.test(error.message) ? error.message : "unknown" }));
            captureServerError(error, { service: "evals-scheduler", event: "ops_digest_failed" });
          }
        }
        // Monthly allowance (spec §6.5, L-14): 1,000 credits per free and PAYG
        // workspace and month, expiring at month end; only with PLANS_V2_ENABLED
        // or a workspace's plans v2 override. Idempotent per workspace and month.
        if (billingCreditsEnabled()) {
          try {
            const allowance = await runMonthlyAllowance(actorId);
            if (allowance.due) console.info(JSON.stringify({ event: "billing_allowance", ...allowance }));
          } catch (error) {
            console.error(JSON.stringify({ event: "billing_allowance_tick_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "billing_allowance_tick_failed" });
          }
        }
        // Auto-recharge (spec §6.6, L-12): off-session charges for workspaces whose
        // balance crossed their threshold. Without a Stripe key of the configured
        // mode it does nothing; failures are logged, never a scheduler failure.
        try {
          const recharge = await runAutoRecharge(actorId);
          if (recharge.workspaces) console.info(JSON.stringify({ event: "billing_auto_recharge", ...recharge }));
        } catch {
          console.error(JSON.stringify({ event: "billing_auto_recharge_tick_failed" }));
        }
        // Invoicing (spec §6.14, L-13): hands queued invoice and rectifying-invoice
        // requests to the adapter named by BILLING_INVOICING_PROVIDER ("manual":
        // pending issue by the accountant) and retries provider failures with a
        // backoff. Off when the provider is unset; never a scheduler failure.
        try {
          const invoicing = await runInvoicing(actorId);
          if (invoicing.handedOver || invoicing.issued || invoicing.failed) console.info(JSON.stringify({ event: "billing_invoicing", ...invoicing }));
        } catch (error) {
          console.error(JSON.stringify({ event: "billing_invoicing_tick_failed" }));
          captureServerError(error, { service: "evals-scheduler", event: "billing_invoicing_tick_failed" });
        }
        // Monthly new questions (launch L-25, P-26): every five minutes, for the
        // workspaces that opted in, start this month's re-reads of their website
        // sources and move open refreshes on (diff, drafting, proposals).
        if (sectorPacksEnabled() && Date.now() - lastRefresh >= 5 * 60_000) {
          lastRefresh = Date.now();
          try {
            for (const orgId of await monthlyQuestionsDue(actorId)) {
              try {
                const refresh = await advanceSourceRefreshes({ orgId, actorId });
                if (refresh.started || refresh.advanced) console.info(JSON.stringify({ event: "monthly_questions", orgId, ...refresh }));
              } catch (error) {
                console.error(JSON.stringify({ event: "scheduler_tick_failed", orgId, task: "monthly_questions" }));
                captureServerError(error, { service: "evals-scheduler", event: "scheduler_tick_failed", task: "monthly_questions", workspace: orgId });
              }
            }
          } catch (error) {
            console.error(JSON.stringify({ event: "monthly_questions_tick_failed" }));
            captureServerError(error, { service: "evals-scheduler", event: "monthly_questions_tick_failed" });
          }
        }
        if (healthy) writeFileSync("/tmp/evals-scheduler-heartbeat", String(Date.now()));
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally {
    await getEvalsPool().end();
  }
}

main().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: "scheduler_stopped", reason: "configuration_or_runtime_failure" }));
  captureServerError(error, { service: "evals-scheduler", event: "scheduler_stopped" });
  await flushErrors();
  process.exitCode = 1;
});
