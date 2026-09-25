import { z } from "zod";
import { writeFileSync } from "node:fs";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { loadKeyring } from "../../lib/evals/security/envelope";
import { tickSchedules } from "../../lib/evals/monitoring/schedules";
import { tickScheduledAlerts } from "../../lib/evals/monitoring/alerts";
import { tickWebhookDeliveries } from "../../lib/evals/monitoring/webhooks";
import { advanceJudgments } from "../../lib/evals/repositories/judging";
import { advanceReportNarratives } from "../../lib/evals/repositories/narratives";

async function main() {
  if (process.env.EVALS_SCHEDULES_ENABLED !== "true") throw new Error("schedules_disabled");
  z.enum(["production", "development"]).parse(process.env.EVALS_ENV);
  const orgs = z.array(z.string().uuid()).min(1).parse(JSON.parse(process.env.EVALS_WORKER_ORG_IDS ?? "[]"));
  const keyFile = z.string().min(1).parse(process.env.EVALS_WEBHOOK_KEYRING_FILE);
  const actorId = z.string().min(1).parse(process.env.EVALS_SCHEDULER_ACTOR_ID);
  const keys = loadKeyring(keyFile);
  let stopping = false;
  let lastTick = 0;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.info(JSON.stringify({ event: "scheduler_ready", workspaces: orgs.length }));
  try {
    while (!stopping) {
      if (Date.now() - lastTick >= 60_000) {
        lastTick = Date.now();
        let healthy = true;
        for (const orgId of orgs) {
          try {
            const scope = { orgId, actorId };
            await tickSchedules(scope);
            await tickScheduledAlerts(scope);
            await tickWebhookDeliveries(scope, keys);
            await advanceJudgments(scope);
            await advanceReportNarratives(scope);
          } catch {
            healthy = false;
            console.error(JSON.stringify({ event: "scheduler_tick_failed", orgId }));
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
