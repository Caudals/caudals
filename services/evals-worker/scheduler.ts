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
import { tickLifecycle } from "../../lib/evals/operations/lifecycle";
import { queueRequiredInputNotifications, resendSender, tickEmailNotifications, type SendEmail } from "../../lib/evals/operations/notifications";

async function main() {
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
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.info(JSON.stringify({ event: "scheduler_ready", workspaces: orgs.current().length }));
  try {
    while (!stopping) {
      if (Date.now() - lastTick >= 60_000) {
        lastTick = Date.now();
        let healthy = true;
        for (const orgId of await orgs.refresh()) {
          const scope = { orgId, actorId };
          // Each task runs on its own: one failing step (a bad generation job,
          // say) must not stop grading, reports or notifications for the workspace.
          const tasks: Array<[string, () => Promise<unknown>]> = [
            ["schedules", () => tickSchedules(scope)],
            ["alerts", () => tickScheduledAlerts(scope)],
            ["webhooks", () => tickWebhookDeliveries(scope, keys)],
            ["restarts", () => advanceEvaluationRestarts(scope)],
            ["generations", () => advancePendingGenerations(scope)],
            ["judgments", () => advanceJudgments(scope)],
            ["narratives", () => advanceReportNarratives(scope)],
            ["finalize", () => finalizeRuns(scope)],
            ["reports", () => refreshJudgedReports(scope)],
            ["notifications", () => queueRequiredInputNotifications(scope)],
          ];
          for (const [task, run] of tasks) {
            try {
              await run();
            } catch (error) {
              healthy = false;
              console.error(JSON.stringify({ event: "scheduler_tick_failed", orgId, task, reason: error instanceof Error && /^[a-z0-9_]{1,80}$/i.test(error.message) ? error.message : error instanceof Error ? error.name : "unknown" }));
            }
          }
        }
        // Retention and deletion cover every workspace, not only the dispatch allowlist.
        try {
          const lifecycle = await tickLifecycle(actorId);
          if (lifecycle.workspaces) console.info(JSON.stringify({ event: "lifecycle_tick", ...lifecycle }));
        } catch {
          healthy = false;
          console.error(JSON.stringify({ event: "lifecycle_tick_failed" }));
        }
        if (send) {
          try {
            const email = await tickEmailNotifications(actorId, send);
            if (email.sent || email.failed) console.info(JSON.stringify({ event: "email_notifications", ...email }));
          } catch {
            console.error(JSON.stringify({ event: "email_notifications_failed" }));
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

main().catch(() => {
  console.error(JSON.stringify({ event: "scheduler_stopped", reason: "configuration_or_runtime_failure" }));
  process.exitCode = 1;
});
