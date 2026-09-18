/**
 * Stage A acceptance probe. This deliberately runs only against a loopback
 * disposable database, but invokes the configured DGX endpoint through the
 * real admin, budget, provider, worker, and result-persistence paths.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { createPrefixedId } from "../../lib/operator/ids";
import { withTenant } from "../../lib/evals/repositories/db";
import {
  enqueueProbe,
  registerAccount,
  registerPrice,
  registerProvider,
  setBudget,
} from "../../lib/evals/providers/admin";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";

const ownerUrl = z.string().url().parse(process.env.EVALS_TEST_DATABASE_URL);
const endpoint = z.string().url().parse(process.env.EVALS_DGX_ENDPOINT);
const parsedOwnerUrl = new URL(ownerUrl);
if (!["127.0.0.1", "localhost"].includes(parsedOwnerUrl.hostname)) {
  throw new Error("The Stage A probe requires a loopback disposable database");
}
if (!endpoint.endsWith("/v1")) {
  throw new Error("EVALS_DGX_ENDPOINT must be the OpenAI-compatible /v1 base URL");
}

const runtimeUrl = z
  .string()
  .url()
  .parse(process.env.EVALS_TEST_RUNTIME_DATABASE_URL);
const adminUrl = z.string().url().parse(process.env.EVALS_TEST_ADMIN_DATABASE_URL);
const workerUrl = z
  .string()
  .url()
  .parse(process.env.EVALS_TEST_WORKER_DATABASE_URL);

async function main() {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const adminPool = new Pool({ connectionString: adminUrl, max: 1 });
  const workerPool = new Pool({ connectionString: workerUrl, max: 1 });
  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 1 });
  const actorId = createPrefixedId("au");
  const orgId = randomUUID();
  const tenant: { orgId: string; actorId: string } = { orgId, actorId };
  const tx: TenantTransaction = (scope, callback) =>
    withTenant(scope, callback, workerPool);

  try {
    await owner.query(
      `INSERT INTO public.auth_user(id,name,email,"emailVerified","createdAt","updatedAt")
       VALUES($1,'Stage A probe',$2,true,now(),now())`,
      [actorId, `${actorId}@example.test`],
    );
    await owner.query(
      `INSERT INTO evals.workspace(id,name,created_by)
       VALUES($1,'Stage A DGX probe',$2)`,
      [orgId, actorId],
    );
    await owner.query(
      "INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')",
      [actorId],
    );

    const configured = await withTenant(
      tenant,
      async (client) => {
        const account = await registerAccount(client, tenant, {
          name: "Stage A disposable DGX",
          currency: "EUR",
          ceiling: "1",
          enabled: true,
        });
        const provider = await registerProvider(
          client,
          tenant,
          {
            accountId: account.id,
            adapter: "dgx",
            endpoint,
            modelId: "bluehawana/deepseek-v4-flash:iq2_m",
            roles: ["target"],
            capabilities: {
              text: false,
              boundedTokens: false,
              probeApproved: true,
            },
            contextLimit: 262144,
            outputLimit: 128,
            dataClasses: ["synthetic"],
            regions: ["private_wireguard"],
            concurrencyLimit: 1,
            rpm: 10,
            tpm: 1000000,
          },
          endpoint,
        );
        const price = await registerPrice(client, tenant, {
          providerRevisionId: provider.id,
          currency: "EUR",
          effectiveAt: new Date(Date.now() - 1000).toISOString(),
          inputPrice: "0",
          outputPrice: "0",
          cachePrice: "0",
          toolPrice: "0",
          uncertaintyBps: 0,
          source: "Stage A local DGX probe; no external provider charge",
        });
        const workspaceBudget = await setBudget(client, tenant, {
          kind: "workspace",
          scopeId: orgId,
          currency: "EUR",
          ceiling: "1",
        });
        return { account, provider, price, workspaceBudget };
      },
      adminPool,
    );

    const worker = new InvocationWorker({
      tx,
      keys: new Map(),
      actorId,
      workerId: randomUUID(),
      dgxEndpoint: endpoint,
    });
    const prompts = {
      text: "Reply exactly OK.",
      json_object: 'Return a JSON object with the field "value" set to "OK".',
      tools: 'Call probe_echo with the value "OK".',
    } as const;
    const observations: Array<Record<string, unknown>> = [];

    for (const probeKind of ["text", "json_object", "tools"] as const) {
      const runId = randomUUID();
      const queued = await withTenant(
        tenant,
        async (client) => {
          const runBudget = await setBudget(client, tenant, {
            kind: "run",
            scopeId: runId,
            currency: "EUR",
            ceiling: "1",
          });
          return enqueueProbe(client, tenant, {
            probeKind,
            providerRevisionId: configured.provider.id,
            priceRevisionId: configured.price.id,
            workspaceBudgetId: configured.workspaceBudget.id,
            runBudgetId: runBudget.id,
            role: "target",
            dataClass: "synthetic",
            region: "private_wireguard",
            routing: "local_only",
            approvedProviderIds: [],
            messages: [{ role: "user", content: prompts[probeKind] }],
            maxOutputTokens: 64,
            timeoutMs: 120000,
            internalCostPerSecond: "0.001",
          });
        },
        adminPool,
      );
      const inputHash = await withTenant(
        tenant,
        async (client) =>
          (
            await client.query(
              "SELECT input_hash FROM evals.workflow_step WHERE org_id=$1 AND id=$2",
              [orgId, queued.stepId],
            )
          ).rows[0].input_hash as string,
        runtimePool,
      );
      await worker.handle({ orgId, stepId: queued.stepId, inputHash });
      const observation = await owner.query(
        `SELECT s.status,r.output->'capabilityEvidence' AS evidence,
                r.output->'usage' AS usage,r.output->>'finishReason' AS finish_reason,
                b.state AS reservation_state,c.provenance,c.internal_estimate::text
         FROM evals.workflow_step s
         LEFT JOIN evals.execution_result r ON (r.org_id,r.step_id)=(s.org_id,s.id)
         LEFT JOIN evals.execution_attempt a ON (a.org_id,a.step_id)=(s.org_id,s.id)
         LEFT JOIN evals.budget_reservation b ON (b.org_id,b.attempt_id)=(a.org_id,a.id)
         LEFT JOIN evals.execution_cost_entry c ON (c.org_id,c.reservation_id)=(b.org_id,b.id)
         WHERE s.org_id=$1 AND s.id=$2`,
        [orgId, queued.stepId],
      );
      observations.push({ probeKind, ...observation.rows[0] });
    }

    const health = await owner.query(
      "SELECT state,last_probe_at IS NOT NULL AS probed FROM evals.provider_health WHERE provider_revision_id=$1",
      [configured.provider.id],
    );
    console.info(
      JSON.stringify({
        model: "bluehawana/deepseek-v4-flash:iq2_m",
        observations,
        health: health.rows[0],
      }),
    );
    if (observations.some((item) => item.status === "queued" || item.status === "unknown")) {
      throw new Error("one_or_more_probes_did_not_reach_a_durable_result");
    }
  } finally {
    await Promise.all([
      owner.end(),
      adminPool.end(),
      workerPool.end(),
      runtimePool.end(),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "stage_a_dgx_probe_failed",
      reason: error instanceof Error ? error.message : "unknown_error",
    }),
  );
  process.exitCode = 1;
});
