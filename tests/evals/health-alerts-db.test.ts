/**
 * Launch alert signals (L-08, spec P-48) on the production schema: the real
 * scripts/evals/health-alerts.sh runs against the disposable database with
 * host checks off and a local stand-in for the email API, so detection, the
 * runbook links, open/resolve state and the drill are all exercised. Its
 * counts are database-wide, as in production, so it runs on its own copy of
 * the database (I-12, tests/helpers/test-database.ts).
 */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrls } from "../helpers/test-database";

const { ownerUrl } = testDatabaseUrls("health_alerts");
const run = promisify(execFile);
const script = path.resolve(__dirname, "../../scripts/evals/health-alerts.sh");
const hex = () => createHash("sha256").update(randomUUID()).digest("hex");

describe.skipIf(!ownerUrl)("health alerts on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const url = new URL(ownerUrl ?? "postgres://x@localhost/x");
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-alerts-"));
  const state = path.join(dir, "state");
  const credentials = path.join(dir, "credentials.env");
  const sent: Array<{ subject: string; text: string; to: string[] }> = [];
  let server: Server;
  let endpoint = "";
  const ids: string[] = [];
  let noticeFixture: Date | null = null;

  beforeAll(async () => {
    writeFileSync(credentials, "COLLABORATION_NOTIFICATION_EMAIL='alerts@example.test'\nRESEND_FROM_EMAIL='noreply@example.test'\nRESEND_API_KEY='re_test_fixture'\n");
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => { sent.push(JSON.parse(body)); response.end("{}"); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    endpoint = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/emails`;
    // A pg-boss job table stand-in for the engine queue.
    await owner.query("CREATE SCHEMA IF NOT EXISTS alerts_fixture_boss");
    await owner.query("CREATE TABLE IF NOT EXISTS alerts_fixture_boss.job (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state text NOT NULL, start_after timestamptz NOT NULL)");
    // The seeded Gemini increase (revision 2, 2027-01-01) has no notice on a fresh database; from late
    // November its due notice would open price_notice_due here. This suite tests that alert with its own rows.
    noticeFixture = (await replica("SELECT notice_sent_at FROM billing.price_book_revision WHERE revision=2", [])).rows[0]?.notice_sent_at ?? null;
    await replica("UPDATE billing.price_book_revision SET notice_sent_at='2026-10-01T00:00:00Z' WHERE revision=2 AND notice_sent_at IS NULL", []);
  });
  afterAll(async () => {
    if (noticeFixture === null) await replica("UPDATE billing.price_book_revision SET notice_sent_at=NULL WHERE revision=2", []);
    await owner.query("DELETE FROM demo.run WHERE id = ANY($1::uuid[])", [ids]);
    await owner.query("DROP SCHEMA IF EXISTS alerts_fixture_boss CASCADE");
    await owner.query("DELETE FROM billing.stripe_event WHERE id = 'evt_alertsfixture'");
    await owner.end();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function check(extra: Record<string, string> = {}) {
    const { stdout } = await run("bash", [script], {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        CAUDALS_ALERT_HOST_CHECKS: "false",
        CAUDALS_ALERT_STATE_DIR: state,
        CAUDALS_APP_CREDENTIALS: credentials,
        CAUDALS_ALERT_RESEND_URL: endpoint,
        CAUDALS_ALERT_PSQL: `psql -h ${url.hostname} -p ${url.port} -U ${decodeURIComponent(url.username)}`,
        PGPASSWORD: decodeURIComponent(url.password),
        CAUDALS_ALERT_DATABASE: url.pathname.slice(1),
        CAUDALS_ALERT_QUEUE_DATABASE: url.pathname.slice(1),
        CAUDALS_ALERT_QUEUE_SCHEMA: "alerts_fixture_boss",
        ...extra,
      },
    });
    return stdout;
  }

  /** Fixture rows without their parent workspace and account: foreign keys and triggers off for this statement. */
  async function replica(sql: string, params: unknown[]) {
    const client = await owner.connect();
    try {
      await client.query("SET session_replication_role = replica");
      return await client.query(sql, params);
    } finally {
      await client.query("SET session_replication_role = origin");
      client.release();
    }
  }

  async function demo(phase: string, errorCode: string | null, finishedMinutesAgo: number | null, queuedMinutesAgo: number | null = null) {
    const id = randomUUID();
    ids.push(id);
    await owner.query(
      `INSERT INTO demo.run(id,token_hash,locale,phase,error_code,target_kind,target_url,target_host,docs_url,docs_host,client_hash,finished_at,queued_at,started_at)
       VALUES($1,$2,'en',$3,$4,'website','https://example.test','example.test','https://example.test','example.test',$5,
         CASE WHEN $6::int IS NULL THEN NULL ELSE now()-make_interval(mins=>$6::int) END,
         CASE WHEN $7::int IS NULL THEN NULL ELSE now()-make_interval(mins=>$7::int) END,
         CASE WHEN $7::int IS NULL THEN now()-interval '30 minutes' ELSE NULL END)`,
      [id, hex(), phase, errorCode, hex(), finishedMinutesAgo, queuedMinutesAgo],
    );
  }

  it("stays quiet on a healthy database", async () => {
    // Visitor-side failures (an unreachable or thin site) are not an outage.
    await demo("done", null, 5);
    await demo("failed", "site_thin", 6);
    await demo("failed", "target_http_404", 7);
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toBe("");
  });

  it("opens each launch alert once, with its runbook, then resolves it", async () => {
    // Two service failures of five finished demos in the last hour (40 %).
    await demo("failed", "model_timeout", 10);
    await demo("failed", "timeout_asking", 12);
    // A demo waiting 20 minutes, and an engine job waiting 16.
    await demo("reading", null, null, 20);
    await owner.query("INSERT INTO alerts_fixture_boss.job(state,start_after) VALUES('created', now()-interval '16 minutes')");
    // A failed payment webhook (billing.stripe_event, L-12) and a hold open for 25 hours.
    await owner.query(`INSERT INTO billing.stripe_event(id,type,livemode,payload_sha256,stripe_created_at,status,outcome,received_at,last_received_at)
      VALUES('evt_alertsfixture','payment_intent.succeeded',false,repeat('0',64),now(),'failed','processing_error',now()-interval '5 minutes',now()-interval '5 minutes')`);
    const holdId = (await replica(
        `INSERT INTO billing.credit_hold(org_id,hold_key,amount_ucr,state,lot_allocations,request_fingerprint,expires_at,created_at)
         VALUES($1,$2,1,'held','[]'::jsonb,$3,now()+interval '1 hour',now()-interval '25 hours') RETURNING id`,
        [randomUUID(), `fixture:${randomUUID()}`, hex()],
      )).rows[0].id as string;

    expect(await check()).toContain("alerts_sent=5");
    const opened = sent.at(-1)!;
    expect(opened.to).toEqual(["alerts@example.test"]);
    expect(opened.subject).toBe("Caudals platform alert");
    for (const [line, anchor] of [
      ["2 of 5 demos finished in the last hour failed for service reasons", "#15-demo-failures-or-queue"],
      ["1 demos are waiting; the oldest for 20 minutes", "#15-demo-failures-or-queue"],
      ["1 engine jobs have waited more than 15 minutes", "#13-queue-age"],
      ["0 outbound deliveries, 1 payment events", "#16-webhook-failures"],
      ["1 credit holds are unresolved after 24 hours", "#17-billing-incident"],
    ]) {
      expect(opened.text).toContain(line);
      expect(opened.text).toContain(anchor);
    }
    expect(readdirSync(state).sort()).toEqual(["demo_failure_rate", "demo_queue_stale", "engine_queue_stale", "holds_stale", "webhook_failures"]);

    // Open alerts are not repeated within a day.
    const count = sent.length;
    expect(await check()).toBe("");
    expect(sent.length).toBe(count);

    // Clear every condition: one email resolves all five.
    await owner.query("DELETE FROM demo.run WHERE id = ANY($1::uuid[])", [ids]);
    await owner.query("DELETE FROM alerts_fixture_boss.job");
    await owner.query("DELETE FROM billing.stripe_event WHERE id = 'evt_alertsfixture'");
    await replica("DELETE FROM billing.credit_hold WHERE id=$1", [holdId]);
    expect(await check()).toContain("alerts_sent=5");
    expect(sent.at(-1)!.text).toMatch(/RESOLVED demo failure rate[\s\S]*RESOLVED holds stale/);
    expect(readdirSync(state)).toEqual([]);
  });

  it("alerts when an invoice request has waited an hour after provider failures, or a day unattempted (L-13)", async () => {
    // Fixture documents without their order and account: foreign keys off for these statements.
    const invoice = async (attempts: number, hoursAgo: number) => (await replica(
      `INSERT INTO billing.invoice(org_id,order_id,livemode,series_code,operation_date,locale,net_cents,vat_rate_bp,vat_cents,gross_cents,
         tax_treatment,tax_mention,customer,lines,attempts,last_error_code,created_at)
       VALUES($1,$2,false,'CAU',current_date-1,'en',2000,0,0,2000,'non_eu_not_subject','Operación no sujeta','{}'::jsonb,
         '[{"item":"credits"}]'::jsonb,$3,CASE WHEN $3>0 THEN 'provider_error' END,now()-make_interval(hours=>$4)) RETURNING id`,
      [randomUUID(), randomUUID(), attempts, hoursAgo])).rows[0].id as string;
    // Quiet: failing for 30 minutes only, or never attempted for 2 hours (invoicing just switched on).
    const fresh = [await invoice(3, 0), await invoice(0, 2)];
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toBe("");
    const stalled = [await invoice(4, 2), await invoice(0, 25)];
    expect(await check()).toContain("alerts_sent=1");
    expect(sent.at(-1)!.text).toContain("2 invoice requests are still queued");
    expect(sent.at(-1)!.text).toContain("#22-invoicing-backlog");
    await replica("DELETE FROM billing.invoice WHERE id = ANY($1::uuid[])", [[...fresh, ...stalled]]);
    expect(await check()).toContain("alerts_sent=1");
    expect(sent.at(-1)!.text).toContain("RESOLVED invoicing stalled");
  });

  it("alerts on a daily reconciliation with unexplained differences and on a price notice due within a week (L-16)", async () => {
    const report = (await owner.query(`INSERT INTO billing.reconciliation_report(day,livemode,actor_id,discrepancies,explained,stripe_checked,report)
      VALUES(current_date,false,'service:fixture',2,0,true,'{}'::jsonb) RETURNING id`)).rows[0].id as string;
    const revision = (await replica(`INSERT INTO billing.price_book_revision(revision,status,title,effective_at,multiplier,fx_usd_per_eur,fx_date,fx_source,raises_prices,created_by,scheduled_by,scheduled_at)
      VALUES((SELECT max(revision)+1 FROM billing.price_book_revision),'scheduled','Alert fixture',now()+interval '35 days',1.5,1.1605,'2026-08-19','ECB',true,'fixture','fixture',now())
      RETURNING id`, [])).rows[0].id as string;
    expect(await check()).toContain("alerts_sent=2");
    const opened = sent.at(-1)!.text;
    expect(opened).toContain("found 2 unexplained differences");
    expect(opened).toContain("1 price-book revisions raise prices");
    expect(opened).toContain("#23-billing-reconciliation-and-price-notices");
    await replica("DELETE FROM billing.reconciliation_report WHERE id=$1", [report]);
    await replica("DELETE FROM billing.price_book_revision WHERE id=$1", [revision]);
    expect(await check()).toContain("alerts_sent=2");
    expect(sent.at(-1)!.text).toMatch(/RESOLVED (billing reconciliation|price notice due)/);
  });

  it("alerts on provider-price changes nobody acknowledged, and stays quiet for acknowledged findings (G2)", async () => {
    const revision = (await owner.query("SELECT id FROM billing.price_book_at(now())")).rows[0].id as string;
    const change = (model: string, listed: string, recompute = true) => ({ label: model, provider: "openrouter", modelId: model, minInputTokens: 0, listing: model, proxy: false,
      status: "changed", input: { book: "0.1", listed, change: 0.5 }, output: { book: "0.5", listed: "0.5", change: 0 }, recompute });
    const record = async (changes: unknown[], minutesAgo: number) => (await owner.query(`INSERT INTO billing.price_check(actor_id,revision_id,checked,changed,unavailable,changes,checked_at)
      VALUES('service:fixture',$1,12,$2,0,$3::jsonb,now()-make_interval(mins=>$4)) RETURNING id`, [revision, changes.length, JSON.stringify(changes), minutesAgo])).rows[0].id as string;
    const checks: string[] = [];
    // Only unavailable listings, no recompute: nothing for ops.
    checks.push(await record([{ label: "Tiered", provider: "google", modelId: "gemini", minInputTokens: 200000, listing: null, proxy: false, status: "unavailable", recompute: false }], 50));
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toBe("");
    // Two rates moved: the alert opens with its runbook.
    checks.push(await record([change("openai/gpt-6-luna", "0.15"), change("deepseek/v4-flash", "0.15", false)], 40));
    expect(await check()).toContain("alerts_sent=1");
    expect(sent.at(-1)!.text).toContain("The weekly provider-price check found 2 rates whose price changed or that need recomputing");
    expect(sent.at(-1)!.text).toContain("#24-provider-price-changes");
    // A platform admin acknowledges those findings: resolved.
    await owner.query("INSERT INTO billing.price_check_ack(check_id,fingerprint,note,actor_id) SELECT id, billing.price_check_fingerprint(revision_id,changes), 'Absorbed until the next FX update', 'au_fixture' FROM billing.price_check WHERE id=$1", [checks[1]]);
    expect(await check()).toContain("alerts_sent=1");
    expect(sent.at(-1)!.text).toContain("RESOLVED price check changes");
    // Next week's check with the same findings stays acknowledged; a new price opens it again.
    checks.push(await record([change("deepseek/v4-flash", "0.15", false), change("openai/gpt-6-luna", "0.15")], 30));
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toBe("");
    checks.push(await record([change("openai/gpt-6-luna", "0.2"), change("deepseek/v4-flash", "0.15", false)], 20));
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toContain("OPEN  The weekly provider-price check found 2 rates");
    await replica("DELETE FROM billing.price_check_ack WHERE check_id = ANY($1::uuid[])", [checks]);
    await replica("DELETE FROM billing.price_check WHERE id = ANY($1::uuid[])", [checks]);
    expect(await check({ CAUDALS_ALERT_DRY_RUN: "true" })).toBe("");
  });

  it("drills every launch alert in one email and resolves it on the next run", async () => {
    expect(await check({ CAUDALS_ALERT_DRILL: "all" })).toContain("alerts_sent=12");
    const drill = sent.at(-1)!;
    expect(drill.subject).toBe("Caudals platform alert (drill)");
    for (const anchor of ["#15-demo-failures-or-queue", "#13-queue-age", "#1-dgx-down", "#11-disk-or-memory-pressure", "#16-webhook-failures", "#17-billing-incident", "#22-invoicing-backlog", "#23-billing-reconciliation-and-price-notices", "#24-provider-price-changes"]) {
      expect(drill.text).toContain(anchor);
    }
    expect(await check()).toContain("alerts_sent=12");
    expect(sent.at(-1)!.text.match(/RESOLVED/g)).toHaveLength(12);
  });

  it("rejects malformed drill keys", async () => {
    await expect(check({ CAUDALS_ALERT_DRILL: "disk;rm" })).rejects.toThrow();
  });
});
