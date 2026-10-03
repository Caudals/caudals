import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { getWebDiscovery, requestWebDiscovery } from "../../lib/evals/repositories/web-discovery";
import { InvocationWorker } from "../../lib/evals/queue/worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("web source discovery on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 4 });
  workerPool.on("connect", (client) => { void client.query("SET ROLE evals_worker"); });
  afterAll(async () => { await workerPool.end(); await owner.end(); await getEvalsPool().end(); });

  it("refuses without web research, then queues a budgeted web-search call and keeps only usable new pages", async () => {
    const { scope, orgId, evaluationId, providerId, priceId, actorId } = await importedJudgeRunFixture(owner, runtimeUrl!);
    await expect(requestWebDiscovery(scope, evaluationId)).rejects.toMatchObject({ status: 503 });
    // Settings register revisions for every engine role; the judge fixture only covers grading.
    const contextProvider = randomUUID(), contextPrice = randomUUID();
    await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
      SELECT $1,account_id,adapter,endpoint,'fixture-reader',owner_id,ARRAY['context_analyzer'],capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit FROM evals.provider_revision WHERE id=$2`, [contextProvider, providerId]);
    await owner.query(`INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source)
      SELECT $1,$2,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source FROM evals.price_revision WHERE id=$3`, [contextPrice, contextProvider, priceId]);
    await owner.query(`INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by,web_research)
      VALUES($1,'context_analyzer',$2,$3,'synthetic','private',0.0001,$4,true)`, [orgId, contextProvider, contextPrice, actorId]);
    const started = await requestWebDiscovery(scope, evaluationId);
    expect(started.status).toBe("queued");
    expect(await requestWebDiscovery(scope, evaluationId)).toMatchObject({ id: started.id });
    expect(await getWebDiscovery(scope, evaluationId)).toMatchObject({ id: started.id, status: "queued" });
    const step = await withTenant(scope, async (c) => (await c.query("SELECT s.id,s.input_hash,s.input FROM evals.web_discovery_job j JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id) WHERE j.org_id=$1", [orgId])).rows[0]);
    expect(step.input).toMatchObject({ role: "context_analyzer", webSearch: { maxResults: 8, queries: [expect.objectContaining({ query: expect.any(String) })] } });
    const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
    const worker = new InvocationWorker({ tx, keys: new Map(), actorId: "discovery-worker", workerId: randomUUID(), leaseSeconds: 30,
      invoke: async () => ({ text: JSON.stringify({ pages: [{ url: "https://help.example.com/fees", title: "Fees", why: "Fee table" }, { url: "ftp://example.com/x" }] }), complete: true, finishReason: "stop", latencyMs: 10, citations: [{ url: "https://example.org/terms", title: "Terms" }] }) });
    await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });
    const done = await getWebDiscovery(scope, evaluationId);
    expect(done).toMatchObject({ status: "completed", reason_code: null });
    expect(done?.suggestions.map((item) => item.url)).toEqual(["https://help.example.com/fees", "https://example.org/terms"]);
  });
});
