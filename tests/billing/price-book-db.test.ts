/**
 * Price book on the production schema (migration 088, spec v2 §6.4, §6.7,
 * §6.16): the seeded revisions, immutability of scheduled and active
 * revisions, the lifecycle and its timing, the €0 guard on customer routes,
 * the run estimator, and server-side role checks on the billing API.
 * Runs against scripts/evals/test-db.sh. Tests in this file run in order and
 * move the global price book; every revision they activate keeps the local rate.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant, type TenantContext } from "../../lib/evals/repositories/db";
import { createPrefixedId } from "../../lib/operator/ids";
import { sha256 } from "../../lib/evals/contracts/hashing";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import {
  activateDuePriceBooks, activatePriceBook, cancelPriceBook, createPriceBookDraft, creditRateUcrPerMillion, getPriceBookAt, rateForProviderRevision,
  REVISION_1_ACTIONS, REVISION_1_MODELS, routePriceIssues, schedulePriceBook,
} from "../../lib/billing/price-book";
import { estimateEvaluationRun } from "../../lib/billing/estimate";
import { createDraftForAdmin, estimateForMember, estimateForToken, listRevisionsForAdmin, revisionForAdmin, transitionForAdmin } from "../../lib/billing/api";
import { creditsToUcr } from "../../lib/billing/units";
import { importedJudgeRunFixture } from "../evals/judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const REV1 = "6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88", REV2 = "9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05";
const SYSTEM = "service:evals-scheduler";
const c = (credits: number | string) => creditsToUcr(credits);

function rolePool(url: string, role: string, max: number) {
  const pool = new Pool({ connectionString: url, max });
  pool.on("connect", client => { void client.query(`SET ROLE ${role}`); });
  return pool;
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe.skipIf(!ownerUrl || !runtimeUrl)("price book on the production schema", () => {
  process.env.EVALS_DATABASE_URL = runtimeUrl;
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 8 });
  const worker = rolePool(ownerUrl!, "evals_worker", 2);
  const admin = rolePool(ownerUrl!, "evals_execution_admin", 2);
  const scheduler = rolePool(ownerUrl!, "evals_scheduler", 2);
  afterAll(async () => { await Promise.all([owner, runtime, worker, admin, scheduler].map(pool => pool.end())); await getEvalsPool().end(); });

  const tx = <T>(pool: Pool, scope: TenantContext, fn: (db: PoolClient) => Promise<T>) => withTenant(scope, fn, pool);
  async function user(platformRole: "platform_admin" | "operator" | null = null) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Price fixture", `${randomUUID()}@example.test`]);
    if (platformRole) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, platformRole]);
    return id;
  }
  async function workspace(ownerId: string) {
    const orgId = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Price fixture',$2)", [orgId, ownerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    return orgId;
  }
  const inEffect = async (at = "now()") => (await owner.query(`SELECT revision, id FROM billing.price_book_at(${at})`)).rows[0];
  let adminId = "", adminOrg = "";
  const asAdmin = <T>(fn: (db: PoolClient) => Promise<T>) => tx(runtime, { orgId: adminOrg, actorId: adminId }, fn);

  it("seeds revision 1 in effect and revision 2 scheduled for 2027, priced exactly by the formula", async () => {
    adminId = await user("platform_admin");
    adminOrg = await workspace(adminId);
    const revisions = (await owner.query("SELECT id,revision,status,effective_at,raises_prices,multiplier::text,fx_usd_per_eur::text FROM billing.price_book_revision ORDER BY revision")).rows;
    expect(revisions.slice(0, 2)).toMatchObject([
      { id: REV1, revision: 1, status: "active", raises_prices: false, multiplier: "1.5000", fx_usd_per_eur: "1.160500" },
      { id: REV2, revision: 2, status: "scheduled", raises_prices: true },
    ]);
    expect((revisions[1].effective_at as Date).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect((await inEffect()).id).toBe(REV1);
    // Revision 2 raises prices: without its 30-day notice it is held back on its date (L-16, migration 094).
    expect((await inEffect("'2027-01-01T00:00:01Z'")).id).toBe(REV1);
    expect((await inEffect("'2026-10-10T00:00:00Z'")).id).toBeNull();
    const rates = (await owner.query("SELECT * FROM billing.model_rate WHERE revision_id=$1", [REV1])).rows;
    expect(rates).toHaveLength(REVISION_1_MODELS.length);
    for (const model of REVISION_1_MODELS) {
      const row = rates.find(item => item.provider === model.provider && item.model_id === model.modelId && item.min_input_tokens === model.minInputTokens)!;
      expect([BigInt(row.input_ucr_per_m), BigInt(row.output_ucr_per_m)], model.label).toEqual([c(model.credits.input), c(model.credits.output)]);
      if (model.usdIn) {
        const recompute = (usd: string) => creditRateUcrPerMillion({ usdPerMillion: usd, fxUsdPerEur: "1.1605", routingFeeBps: row.routing_fee_bps, multiplier: "1.5" });
        expect([recompute(String(row.usd_input_per_m)), recompute(String(row.usd_output_per_m))]).toEqual([BigInt(row.input_ucr_per_m), BigInt(row.output_ucr_per_m)]);
      }
    }
    const gemini = (await owner.query("SELECT r.revision,m.input_ucr_per_m,m.output_ucr_per_m FROM billing.model_rate m JOIN billing.price_book_revision r ON r.id=m.revision_id WHERE m.model_id='gemini-3.8-flash' ORDER BY 1")).rows;
    expect(gemini.map(row => [row.revision, Number(row.input_ucr_per_m) / 1e6, Number(row.output_ucr_per_m) / 1e6])).toEqual([[1, 100, 485], [2, 195, 970]]);
    expect(Number((await owner.query(`SELECT count(*) FROM billing.model_rate a JOIN billing.model_rate b ON b.revision_id=$2 AND b.provider=a.provider
      AND b.model_id IS NOT DISTINCT FROM a.model_id AND b.min_input_tokens=a.min_input_tokens AND (b.input_ucr_per_m,b.output_ucr_per_m)=(a.input_ucr_per_m,a.output_ucr_per_m)
      WHERE a.revision_id=$1`, [REV1, REV2])).rows[0].count)).toBe(12);
    const actions = Object.fromEntries((await owner.query("SELECT meter,ucr_per_unit FROM billing.action_rate WHERE revision_id=$1", [REV1])).rows.map(row => [row.meter, BigInt(row.ucr_per_unit)]));
    expect(actions).toEqual(Object.fromEntries(Object.entries(REVISION_1_ACTIONS).map(([meter, value]) => [meter, c(value)])));
    expect((await owner.query("SELECT per_eur::text,rate_date::text FROM billing.fx_rate WHERE currency='USD'")).rows).toContainEqual({ per_eur: "1.160500", rate_date: "2026-08-19" });
  });

  it("keeps active and scheduled revisions immutable", async () => {
    const reject = (sql: string, params: unknown[], pattern: RegExp) => expect(owner.query(sql, params)).rejects.toThrow(pattern);
    for (const id of [REV1, REV2]) {
      await reject("UPDATE billing.price_book_revision SET title='Changed title' WHERE id=$1", [id], /PRICE_BOOK_IMMUTABLE/);
      await reject("UPDATE billing.model_rate SET input_ucr_per_m=input_ucr_per_m+5000000 WHERE revision_id=$1", [id], /PRICE_BOOK_IMMUTABLE/);
      await reject("DELETE FROM billing.action_rate WHERE revision_id=$1", [id], /PRICE_BOOK_IMMUTABLE/);
      await reject(`INSERT INTO billing.model_rate(revision_id,label,provider,model_id,input_ucr_per_m,output_ucr_per_m,cost_basis,eur_input_per_m,eur_output_per_m,source)
        VALUES($1,'Extra','openrouter','x/y',10000000,10000000,'internal_estimate',0,0,'fixture')`, [id], /PRICE_BOOK_IMMUTABLE/);
      await reject("DELETE FROM billing.price_book_revision WHERE id=$1", [id], /PRICE_BOOK_IMMUTABLE/);
    }
    await reject("UPDATE billing.price_book_revision SET effective_at=now() WHERE id=$1", [REV1], /PRICE_BOOK_IMMUTABLE/);
    await reject("UPDATE billing.price_book_revision SET status='draft' WHERE id=$1", [REV1], /PRICE_BOOK_TRANSITION/);
    await reject("UPDATE billing.price_book_revision SET effective_at='2026-12-31T00:00:00Z' WHERE id=$1", [REV2], /PRICE_BOOK_IMMUTABLE/);
    await expect(owner.query("TRUNCATE billing.model_rate")).rejects.toThrow(/LEDGER_APPEND_ONLY/);
    // The 5-credit grid and the floor hold even for drafts.
    await expect(owner.query(`WITH d AS (INSERT INTO billing.price_book_revision(revision,title,multiplier,fx_usd_per_eur,fx_date,fx_source,created_by)
        VALUES(900,'Grid probe',1.5,1.1605,'2026-08-19','fixture','fixture') RETURNING id)
      INSERT INTO billing.model_rate(revision_id,label,provider,model_id,input_ucr_per_m,output_ucr_per_m,cost_basis,eur_input_per_m,eur_output_per_m,source)
      SELECT id,'Off grid','openrouter','x/y',12000000,20000000,'internal_estimate',0,0,'fixture' FROM d`)).rejects.toThrow(/model_rate_grid/);
  });

  it("lets runtime and worker roles read the price book but never write it", async () => {
    const customerId = await user(), orgId = await workspace(customerId);
    expect(await tx(runtime, { orgId, actorId: customerId }, async db => (await getPriceBookAt(db))?.revision.id)).toBe(REV1);
    expect(Number((await tx(worker, { orgId, actorId: "service:evals-worker" }, db => db.query("SELECT count(*) FROM billing.model_rate"))).rows[0].count)).toBeGreaterThan(0);
    expect(Number((await tx(admin, { orgId, actorId: adminId }, db => db.query("SELECT count(*) FROM billing.action_rate"))).rows[0].count)).toBeGreaterThan(0);
    await expect(tx(runtime, { orgId, actorId: customerId }, db => db.query("UPDATE billing.model_rate SET label='x'"))).rejects.toThrow(/permission denied/);
    await expect(tx(runtime, { orgId, actorId: customerId }, db => db.query("INSERT INTO billing.fx_rate(currency,rate_date,per_eur,source,recorded_by) VALUES('USD','2026-10-01',1.1,'x','x')"))).rejects.toThrow(/permission denied/);
    await expect(tx(runtime, { orgId, actorId: customerId }, db => createPriceBookDraft(db, { title: "Customer draft" }))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(tx(worker, { orgId, actorId: "service:evals-worker" }, db => db.query("SELECT billing.activate_due_price_books()"))).rejects.toThrow(/permission denied/);
    await expect(tx(runtime, { orgId, actorId: customerId }, db => routePriceIssues(db))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("drafts, schedules with notice, activates on time and retires through the admin functions", async () => {
    const d1 = (await asAdmin(db => createPriceBookDraft(db, { title: "Flash-Lite decrease", models: [{ provider: "google", modelId: "gemini-3.1-flash-lite", usdInputPerM: "0.20", usdOutputPerM: "1.20" }] })))!;
    expect(d1.revision).toMatchObject({ status: "draft", basedOnId: REV1, multiplier: "1.5000", fxUsdPerEur: "1.160500", createdBy: adminId });
    expect(d1.models).toHaveLength(13);
    const lite = d1.models.find(rate => rate.modelId === "gemini-3.1-flash-lite")!;
    expect([lite.inputUcrPerM, lite.outputUcrPerM]).toEqual([c(30), c(160)]);
    // A draft is editable; the guard is per status.
    await owner.query("UPDATE billing.model_rate SET label='Gemini 3.1 Flash-Lite (Google, draft)' WHERE id=$1", [lite.id]);
    // Revision 2 (2027) is scheduled after any "now": cancel it before scheduling an earlier one.
    await expect(asAdmin(db => schedulePriceBook(db, d1.revision.id, new Date()))).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    expect(await asAdmin(db => cancelPriceBook(db, REV2))).toMatchObject({ status: "draft", effectiveAt: null });
    const scheduled = await asAdmin(db => schedulePriceBook(db, d1.revision.id, new Date(Date.now() - 60_000)));
    expect(scheduled).toMatchObject({ status: "scheduled", raisesPrices: false });
    expect((await inEffect()).id).toBe(d1.revision.id);
    await expect(owner.query("UPDATE billing.model_rate SET label='Changed again' WHERE id=$1", [lite.id])).rejects.toThrow(/PRICE_BOOK_IMMUTABLE/);
    expect(await asAdmin(db => activatePriceBook(db, d1.revision.id))).toMatchObject({ status: "active" });
    expect((await owner.query("SELECT status,retired_at IS NOT NULL AS retired FROM billing.price_book_revision WHERE id=$1", [REV1])).rows[0]).toEqual({ status: "retired", retired: true });
    // An increase needs 30 days' notice and cannot be brought forward.
    const d2 = (await asAdmin(db => createPriceBookDraft(db, { title: "Gemini 3.8 Flash increase", models: [{ provider: "google", modelId: "gemini-3.8-flash", usdInputPerM: "1.50", usdOutputPerM: "7.50" }] })))!;
    await expect(asAdmin(db => schedulePriceBook(db, d2.revision.id, new Date(Date.now() + 10 * 86_400_000)))).rejects.toMatchObject({ code: "NOTICE_PERIOD_REQUIRED" });
    expect(await asAdmin(db => schedulePriceBook(db, d2.revision.id, new Date(Date.now() + 31 * 86_400_000)))).toMatchObject({ status: "scheduled", raisesPrices: true });
    await expect(asAdmin(db => activatePriceBook(db, d2.revision.id))).rejects.toMatchObject({ code: "NOTICE_PERIOD_REQUIRED" });
    await asAdmin(db => cancelPriceBook(db, d2.revision.id));
    // A decrease scheduled two seconds ahead applies exactly then, before the hourly job relabels it.
    const d3 = (await asAdmin(db => createPriceBookDraft(db, { title: "Website question decrease", actions: [{ meter: "website_question", credits: "4" }] })))!;
    await asAdmin(db => schedulePriceBook(db, d3.revision.id, new Date(Date.now() + 2000)));
    expect((await inEffect()).id).toBe(d1.revision.id);
    await sleep(2300);
    expect((await inEffect()).id).toBe(d3.revision.id);
    const activated = await tx(scheduler, { orgId: "", actorId: SYSTEM }, db => activateDuePriceBooks(db));
    expect(activated.map(revision => revision.id)).toEqual([d3.revision.id]);
    expect((await owner.query("SELECT id,status FROM billing.price_book_revision WHERE id = ANY($1::uuid[]) ORDER BY revision", [[d1.revision.id, d3.revision.id]])).rows.map(row => row.status)).toEqual(["retired", "active"]);
    // A revision must price every meter and the local model.
    const d5 = (await asAdmin(db => createPriceBookDraft(db, { title: "No local model", models: [{ provider: "dgx", modelId: null, remove: true }] })))!;
    await expect(asAdmin(db => schedulePriceBook(db, d5.revision.id, new Date(Date.now() + 86_400_000 * 400)))).rejects.toMatchObject({ code: "PRICE_BOOK_INCOMPLETE" });
    // Every step is audited with the acting admin.
    const audited = (await owner.query("SELECT action FROM evals.audit_event WHERE actor_id=$1 AND action LIKE 'billing.price_book.%'", [adminId])).rows.map(row => row.action);
    expect(audited).toEqual(expect.arrayContaining(["billing.price_book.drafted", "billing.price_book.scheduled", "billing.price_book.activated", "billing.price_book.cancelled"]));
  });

  it("refuses a €0 or unpriced paid model on every customer route unless it is a free model", async () => {
    const ownerId = await user(), orgId = await workspace(ownerId);
    const projectId = randomUUID(), evaluationId = randomUUID(), account = randomUUID();
    const client = await owner.connect();
    try {
      await client.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)", [ownerId, orgId]);
      await client.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Guard fixture')", [projectId, orgId]);
      await client.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Guard','source_grounded',5,'EUR')", [evaluationId, orgId, projectId]);
    } finally { client.release(); }
    await owner.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'Guard','EUR',100,true)", [account]);
    async function model(adapter: "dgx" | "openai_compatible", modelId: string, price: string, free = false) {
      const id = randomUUID(), priceId = randomUUID();
      await owner.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit,free_model)
        VALUES($1,$2,$3,$4,$5,'fixture',ARRAY['judge','generator','context_analyzer','report_writer'],'{"text":true}',32000,4096,ARRAY['customer_confidential'],ARRAY['external_api'],10,100000,1,$6)`,
      [id, account, adapter, adapter === "dgx" ? "http://dgx.invalid/v1" : "https://openrouter.ai/api/v1", modelId, free]);
      await owner.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',$3,$3,0,0,0,'fixture')", [priceId, id, price]);
      return { id, priceId };
    }
    const route = (table: string, role: string, m: { id: string; priceId: string }) => table === "evaluation"
      ? owner.query("INSERT INTO evals.evaluation_model_route(org_id,evaluation_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,$5,'customer_confidential','external_api',0,'fixture')", [orgId, evaluationId, role, m.id, m.priceId])
      : table === "platform"
        ? owner.query("INSERT INTO evals.platform_model_route(role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,'customer_confidential','external_api',0,'fixture')", [role, m.id, m.priceId])
        : owner.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'customer_confidential','external_api',0,'fixture')", [orgId, role, m.id, m.priceId]);
    const zeroLuna = await model("openai_compatible", "openai/gpt-6-luna", "0");
    const pricedLuna = await model("openai_compatible", "openai/gpt-6-luna", "0.000000091");
    const unknown = await model("openai_compatible", "vendor/unlisted-model", "0.000001");
    const free = await model("openai_compatible", "nvidia/nemotron-3-super-120b-a12b:free", "0", true);
    const local = await model("dgx", "fixture-local", "0");
    for (const table of ["workspace", "evaluation", "platform"]) await expect(route(table, "judge", zeroLuna)).rejects.toThrow(/MODEL_PRICE_ZERO/);
    await expect(route("workspace", "judge", unknown)).rejects.toThrow(/MODEL_RATE_MISSING/);
    await route("workspace", "judge", pricedLuna);
    await route("workspace", "generator", free);
    await route("workspace", "context_analyzer", local);
    await route("evaluation", "judge", local);
    await expect(owner.query("UPDATE evals.generation_provider_route SET provider_revision_id=$3,price_revision_id=$4 WHERE org_id=$1 AND role=$2", [orgId, "context_analyzer", zeroLuna.id, zeroLuna.priceId]))
      .rejects.toThrow(/MODEL_PRICE_ZERO/);
    // The flag is part of the immutable revision.
    await expect(owner.query("UPDATE evals.provider_revision SET free_model=true WHERE id=$1", [zeroLuna.id])).rejects.toThrow(/immutable execution record/);
    const issues = await asAdmin(db => routePriceIssues(db));
    expect(issues.filter(item => item.orgId === orgId).map(item => [item.scope, item.role, item.issue])).toEqual([
      ["evaluation", "judge", null], ["workspace", "context_analyzer", null], ["workspace", "generator", null], ["workspace", "judge", null],
    ]);
    expect(await tx(runtime, { orgId, actorId: ownerId }, db => rateForProviderRevision(db, pricedLuna.id))).toMatchObject({ provider: "openrouter", modelId: "openai/gpt-6-luna", inputUcrPerM: c(15) });
    expect(await tx(runtime, { orgId, actorId: ownerId }, db => rateForProviderRevision(db, local.id))).toMatchObject({ provider: "dgx", modelId: null, inputUcrPerM: c(50), outputUcrPerM: c(200) });
    // A revision that drops a model in use cannot be scheduled.
    const drop = (await asAdmin(db => createPriceBookDraft(db, { title: "Drop Luna", models: [{ provider: "openrouter", modelId: "openai/gpt-6-luna", remove: true }] })))!;
    await expect(asAdmin(db => schedulePriceBook(db, drop.revision.id, new Date(Date.now() + 400 * 86_400_000)))).rejects.toMatchObject({ code: "ROUTE_UNPRICED" });
    await owner.query("DELETE FROM evals.generation_provider_route WHERE org_id=$1", [orgId]);
    await owner.query("DELETE FROM evals.evaluation_model_route WHERE org_id=$1", [orgId]);
  });

  it("estimates an evaluation run from its frozen test set", async () => {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    const estimate = await tx(runtime, f.scope, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId }).catch(error => error));
    // No selected system yet: the estimate asks for one.
    expect(estimate).toMatchObject({ code: "INPUT_INVALID" });
    const target = (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [f.run.id])).rows[0].target_revision_id;
    const result = await tx(runtime, f.scope, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: target, sources: { webPages: 3 } }));
    // A managed (contract) workspace runs on its contract budget: no credit gate.
    expect(result).toMatchObject({ connection: "imported", questions: { count: 2, executions: 2, judged: 2, generated: 0 },
      balance: { billingMode: "contract", requiresCredits: false, coversP90: true, addCredits: null } });
    expect(result.lines.filter(line => line.kind === "meter")).toEqual([
      { kind: "meter", key: "graded_answer", quantity: 2, p50Ucr: String(c(2)), p90Ucr: String(c(2)) },
      { kind: "meter", key: "web_page_read", quantity: 3, p50Ucr: String(c(3)), p90Ucr: String(c(3)) },
    ]);
    expect(result.models.judge).toMatchObject({ modelId: "fixture-judge", priced: true, rate: "Caudals Local (DeepSeek V4 Flash on the DGX)" });
    expect(BigInt(result.ucr.p50)).toBeGreaterThan(c(5));
    expect(BigInt(result.ucr.p90)).toBeGreaterThanOrEqual(BigInt(result.ucr.p50));
    await owner.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [f.orgId]);
    const free = await tx(runtime, f.scope, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: target, sources: { webPages: 3 } }));
    expect(free.balance).toMatchObject({ billingMode: "free", requiresCredits: true, availableCredits: "0", coversP90: false });
    expect(Number(free.balance!.addCredits)).toBe(Number(free.credits.p90));
    expect(BigInt(result.largestHold.ucr)).toBeGreaterThan(BigInt(0));
    const generated = await tx(runtime, { orgId: f.orgId, actorId: "customer-api-token" }, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, targetRevisionId: target, generation: { questions: 24 } }));
    expect(generated.questions).toEqual({ count: 24, executions: 24, judged: 24, generated: 24 });
    await expect(tx(runtime, f.scope, db => estimateEvaluationRun(db, f.orgId, { evaluationId: f.evaluationId, suiteVersionId: f.suiteVersionId, targetRevisionId: target, models: { generator: f.providerId } })))
      .rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(tx(runtime, f.scope, db => estimateEvaluationRun(db, f.orgId, { evaluationId: randomUUID(), suiteVersionId: f.suiteVersionId }))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("checks roles server-side on the estimate and price-book APIs", async () => {
    const f = await importedJudgeRunFixture(owner, runtimeUrl!);
    const target = (await owner.query("SELECT target_revision_id FROM evals.run WHERE id=$1", [f.run.id])).rows[0].target_revision_id;
    await owner.query("UPDATE evals.evaluation SET selected_target_revision_id=$2,selected_suite_version_id=$3 WHERE id=$1", [f.evaluationId, target, f.suiteVersionId]);
    const body = { orgId: f.orgId, evaluationId: f.evaluationId };
    const request = (headers: Record<string, string> = {}) => new Request("https://app.caudals.test/api/evals/v1/billing/estimates", { method: "POST", headers: { "content-type": "application/json", ...headers } });
    async function member(role: "owner" | "editor" | "viewer" | "operator") {
      const id = await user();
      await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [f.orgId, id, role]);
      return { user: { id, email: "x@example.test", name: "x" }, platformRole: null, workspaces: [{ id: f.orgId, name: "Judge fixture", role }] } satisfies EvalIdentity;
    }
    const [ownerIdentity, editor, viewer, operator] = [await member("owner"), await member("editor"), await member("viewer"), await member("operator")];
    const platformAdmin: EvalIdentity = { user: { id: adminId, email: "a@example.test", name: "a" }, platformRole: "platform_admin", workspaces: [], sessionCreatedAt: new Date().toISOString() };
    const token = `evct_${randomBytes(32).toString("base64url")}`, readOnly = `evct_${randomBytes(32).toString("base64url")}`;
    await owner.query("INSERT INTO evals.customer_api_token(org_id,name,token_hash,scopes,expires_at,created_by) VALUES($1,'CI',$2,ARRAY['runs:read'],now()+interval '1 day','fixture'),($1,'Reports',$3,ARRAY['reports:read'],now()+interval '1 day','fixture')", [f.orgId, sha256(token), sha256(readOnly)]);
    const denied = (promise: Promise<unknown>, status: number) => expect(promise).rejects.toMatchObject({ status });

    delete process.env.BILLING_ESTIMATES_ENABLED;
    await denied(estimateForMember(request({ "idempotency-key": "k-off" }), editor, body), 404);
    await denied(estimateForToken(request({ "idempotency-key": "k-off", authorization: `Bearer ${token}` }), body), 404);

    process.env.BILLING_ESTIMATES_ENABLED = "operators";
    await denied(estimateForMember(request({ "idempotency-key": "k-op-1" }), editor, body), 404);
    await denied(estimateForToken(request({ "idempotency-key": "k-op-2", authorization: `Bearer ${token}` }), body), 404);
    expect(await estimateForMember(request({ "idempotency-key": "k-op-3" }), operator, body)).toMatchObject({ evaluationId: f.evaluationId, connection: "imported" });
    expect(await estimateForMember(request({ "idempotency-key": "k-op-4" }), platformAdmin, body)).toMatchObject({ evaluationId: f.evaluationId });

    process.env.BILLING_ESTIMATES_ENABLED = "true";
    const first = await estimateForMember(request({ "idempotency-key": "k-all-1" }), editor, body);
    expect(await estimateForMember(request({ "idempotency-key": "k-all-1" }), editor, body)).toEqual(JSON.parse(JSON.stringify(first)));
    await expect(estimateForMember(request({ "idempotency-key": "k-all-1" }), editor, { ...body, sources: { webPages: 1 } })).rejects.toMatchObject({ status: 409 });
    expect(await estimateForMember(request({ "idempotency-key": "k-all-2" }), ownerIdentity, body)).toMatchObject({ questions: { count: 2 } });
    await denied(estimateForMember(request({ "idempotency-key": "k-all-3" }), viewer, body), 404);
    await denied(estimateForMember(request(), editor, body), 400);
    expect(await estimateForToken(request({ "idempotency-key": "k-ci-1", authorization: `Bearer ${token}` }), body)).toMatchObject({ questions: { count: 2 } });
    await denied(estimateForToken(request({ "idempotency-key": "k-ci-2", authorization: `Bearer ${readOnly}` }), body), 403);
    await denied(estimateForToken(request({ "idempotency-key": "k-ci-3", authorization: `Bearer ${token}` }), { ...body, orgId: adminOrg }), 403);
    delete process.env.BILLING_ESTIMATES_ENABLED;

    // Price book: platform admins only; changes need a recent sign-in and an Idempotency-Key.
    const adminRequest = (key?: string) => new Request("https://app.caudals.test/api/evals/v1/billing/admin/price-book/revisions", { method: "POST", headers: key ? { "idempotency-key": key } : {} });
    await denied(listRevisionsForAdmin(editor, f.orgId), 403);
    await denied(listRevisionsForAdmin({ ...ownerIdentity, platformRole: "operator" }, f.orgId), 403);
    const listed = await listRevisionsForAdmin(platformAdmin, adminOrg);
    expect(listed.revisions.length).toBeGreaterThanOrEqual(2);
    expect(listed.effectiveRevisionId).toBeTruthy();
    await denied(createDraftForAdmin(adminRequest("d-1"), editor, { orgId: adminOrg, title: "Editor draft" }), 403);
    await expect(createDraftForAdmin(adminRequest("d-1"), { ...platformAdmin, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() }, { orgId: adminOrg, title: "Stale draft" }))
      .rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await denied(createDraftForAdmin(adminRequest(), platformAdmin, { orgId: adminOrg, title: "No key" }), 400);
    const draft = await createDraftForAdmin(adminRequest("d-2"), platformAdmin, { orgId: adminOrg, title: "API draft", models: [{ provider: "openrouter", modelId: "openai/gpt-6-luna", usdInputPerM: "0.08", usdOutputPerM: "0.40" }] });
    expect((await createDraftForAdmin(adminRequest("d-2"), platformAdmin, { orgId: adminOrg, title: "API draft", models: [{ provider: "openrouter", modelId: "openai/gpt-6-luna", usdInputPerM: "0.08", usdOutputPerM: "0.40" }] }))!.id).toBe(draft!.id);
    const detail = await revisionForAdmin(platformAdmin, adminOrg, draft!.id);
    expect(detail.models.find(rate => rate.modelId === "openai/gpt-6-luna")).toMatchObject({ credits: { input: "15", output: "55" } });
    await denied(transitionForAdmin(adminRequest("s-1"), editor, draft!.id, "schedule", { orgId: adminOrg, effectiveAt: new Date().toISOString() }), 403);
    await expect(transitionForAdmin(adminRequest("s-2"), platformAdmin, draft!.id, "schedule", { orgId: adminOrg, effectiveAt: new Date(Date.now() + 500 * 86_400_000).toISOString() }))
      .resolves.toMatchObject({ status: "scheduled", raisesPrices: false });
    await expect(transitionForAdmin(adminRequest("s-3"), platformAdmin, draft!.id, "activate", { orgId: adminOrg })).resolves.toMatchObject({ status: "active" });
    await expect(transitionForAdmin(adminRequest("s-4"), platformAdmin, draft!.id, "cancel", { orgId: adminOrg })).rejects.toMatchObject({ code: "PRICE_BOOK_TRANSITION", status: 409 });
  });
});
