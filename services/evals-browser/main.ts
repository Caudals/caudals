import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { z } from "zod";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import {
  createBoss,
  dispatchOutbox,
  startBoss,
  type JobData,
} from "../../lib/evals/queue/boss";
import { BrowserJobWorker } from "../../lib/evals/queue/browser-worker";
import { loadKeyring } from "../../lib/evals/security/envelope";
import { checkBrowserDestination } from "./egress-client";

async function main() {
  if (process.env.EVALS_BROWSER_ENABLED !== "true") throw new Error("browser_disabled");
  const orgs = z
    .array(z.string().uuid())
    .min(1)
    .parse(JSON.parse(process.env.EVALS_BROWSER_ORG_IDS ?? "[]"));
  const actorId = z.string().min(1).parse(process.env.EVALS_BROWSER_ACTOR_ID);
  const keys = loadKeyring(z.string().min(1).parse(process.env.EVALS_BROWSER_SESSION_KEYRING_FILE));
  const egressHost = z.string().min(1).parse(process.env.EVALS_BROWSER_EGRESS_HOST);
  const egressPort = z.coerce.number().int().min(1).max(65535)
    .parse(process.env.EVALS_BROWSER_EGRESS_PORT);
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `http://${egressHost}:${egressPort}` },
  });
  const boss = createBoss();
  boss.on("error", () => console.error(JSON.stringify({ event: "browser_queue_error" })));
  const worker = new BrowserJobWorker({
    tx: withTenant,
    // This mount contains only browser-session key versions, never provider keys.
    keys,
    actorId,
    workerId: randomUUID(),
    browser,
    destinationCheck: (url) => checkBrowserDestination(url, egressHost, egressPort),
  });
  try {
    await startBoss(boss);
    await boss.work<JobData>(
      "execute_browser",
      { batchSize: 1, pollingIntervalSeconds: 2 },
      async (jobs: any[]) => {
        for (const job of jobs) {
          if (!orgs.includes(job.data.orgId)) throw new Error("browser_tenant_denied");
          if (!(await worker.canHandle(job.data))) throw new Error("browser_job_invalid");
          await worker.handle(job.data);
        }
      },
    );
    let stopping = false;
    const stop = () => {
      stopping = true;
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    console.info(JSON.stringify({ event: "browser_worker_ready" }));
    while (!stopping) {
      for (const orgId of orgs) {
        const tenant = { orgId, actorId };
        await worker.recover(tenant);
        await dispatchOutbox(boss, withTenant, tenant, 10);
      }
      writeFileSync("/tmp/evals-browser-heartbeat", String(Date.now()));
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 150_000 });
    await browser.close();
    await getEvalsPool().end();
  }
}

main().catch(() => {
  console.error(
    JSON.stringify({
      event: "browser_worker_stopped",
      reason: "configuration_or_runtime_failure",
    }),
  );
  process.exitCode = 1;
});
