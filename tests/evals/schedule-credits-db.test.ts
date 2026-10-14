/**
 * Launch L-18 on the production schema (spec v2 P-19, P-24, P-25, §6.7,
 * §6.10): a pay-as-you-go owner's schedule with a credit limit; each due slot
 * checked for credits before its run exists (skipped with an alert, once,
 * where credits are enforced; recorded and run in shadow mode); scheduled runs
 * charged through the engine path (L-11) with shadow parity; the schedule's
 * cap at dispatch and while a run is going (billing watch); the regression
 * summary after each run (score against last time, newly broken questions,
 * email per person once, nothing for runs that cannot be compared); and the
 * run comparison behind "Run again". DST and catch-up rules are the calendar's
 * own (tests/evals/stage-d-calendar.test.ts); the catch-up here checks only the
 * latest missed slot runs. Database: scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { createSchedule, listSchedules, tickSchedules, updateSchedule } from "../../lib/evals/monitoring/schedules";
import { scheduleMonthSpendUcr, type ScheduleAdmission } from "../../lib/evals/monitoring/schedule-credits";
import { tickScheduledAlerts } from "../../lib/evals/monitoring/alerts";
import { runComparison } from "../../lib/evals/monitoring/run-comparison";
import { runBillingWatch } from "../../lib/billing/watch";
import { grantCredits } from "../../lib/billing/ledger";
import { creditsToUcr } from "../../lib/billing/units";
import { TargetExecutionWorker } from "../../lib/evals/queue/target-worker";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { reviewAssessment, scoreRun } from "../../lib/evals/repositories/managed";
import { deliverEmailNotifications, type EmailMessage } from "../../lib/evals/operations/notifications";
import { genericGroundedQaPack, syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { CandidateInput } from "../../lib/evals/contracts/projections";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const SCHEDULER = "service:evals-scheduler";
const WORKER = "service:evals-worker";
const B = (value: unknown) => BigInt(String(value));
const ENV_KEYS = ["BILLING_CREDITS_ENABLED", "BILLING_ENFORCE", "BILLING_STRIPE_MODE", "COLLABORATION_NOTIFICATION_EMAIL", "BRANDED_EMAILS_ENABLED", "EVALS_APP_URL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
type Mode = "off" | "shadow" | "enforce";
function setMode(mode: Mode) {
  process.env.BILLING_STRIPE_MODE = "test";
  process.env.COLLABORATION_NOTIFICATION_EMAIL = "";
  if (mode === "off") { delete process.env.BILLING_CREDITS_ENABLED; delete process.env.BILLING_ENFORCE; return; }
  process.env.BILLING_CREDITS_ENABLED = "true";
  process.env.BILLING_ENFORCE = mode;
}

describe.skipIf(!ownerUrl || !runtimeUrl)("schedules on credits, re-run and compare, regression summaries (L-18)", () => {
  process.env.EVALS_DATABASE_URL = runtimeUrl;
  const owner = new Pool({ connectionString: ownerUrl, max: 4 });
  const workerPool = new Pool({ connectionString: ownerUrl, max: 6 });
  workerPool.on("connect", client => { void client.query("SET ROLE evals_worker"); });
  const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, workerPool);
  afterEach(() => { for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  afterAll(async () => { await Promise.all([owner.end(), workerPool.end(), getEvalsPool().end()]); });

  /* ------------------------------------------------------------ fixtures --- */

  async function user(email = `${randomUUID()}@example.test`) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Schedule fixture", email]);
    return { id, email };
  }

  /** A workspace (pay as you go by default) with an API system, a ready connection and an approved test set of `questions` questions. */
  async function seed(options: { plan?: "payg" | "managed"; questions?: number } = {}) {
    const ownerUser = await user(`schedules-${randomUUID().slice(0, 8)}@caudals.com`), outsideOwner = await user(), viewer = await user(), mutedViewer = await user(), operator = await user();
    const orgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID(), evaluationId = randomUUID();
    const { source } = syntheticAccountingFixture(ownerUser.id);
    const count = options.questions ?? 3;
    const titles = ["Management fee", "Custody fee", "Instalments", "Transfers", "Withdrawals"].slice(0, count);
    const pack = genericGroundedQaPack({ source, authorId: ownerUser.id, questions: titles.map((title, index) => ({
      question: `Question ${index + 1}: ${title}?`, expected: `Answer ${index + 1}`, anchor: source.anchors[0].id, title, severity: index === 0 ? "critical" as const : "medium" as const })) });
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible", endpoint: "https://example.test/v1", model: "fixture", credential: { kind: "none" },
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 1000, concurrent_sessions: 100, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [ownerUser.id, orgId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Schedule fixture',$2)", [orgId, ownerUser.id]);
      await db.query(`INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'owner'),($1,$4,'viewer'),($1,$5,'viewer'),($1,$6,'operator')`,
        [orgId, ownerUser.id, outsideOwner.id, viewer.id, mutedViewer.id, operator.id]);
      await db.query("INSERT INTO evals.notification_preference(org_id,user_id,email_regressions) VALUES($1,$2,false)", [orgId, mutedViewer.id]);
      await db.query("UPDATE evals.workspace_entitlement SET plan=$2,can_schedule=true,max_runs_per_month=NULL,max_active_runs=5 WHERE org_id=$1", [orgId, options.plan ?? "payg"]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Schedule fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Support API')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
      await db.query("INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report) VALUES($1,$2,'ready',$3)", [orgId, revisionId, { features: [{ capability: "text", status: "supported" }] }]);
      await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [pack.rubric.revision_id, orgId, projectId, pack.rubric.content_hash, pack.rubric]);
      for (const item of pack.cases) {
        await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
        await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, pack.rubric.revision_id]);
      }
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status,selected_target_revision_id) VALUES($1,$2,$3,'Support assistant','source_grounded',10,'EUR','ready',$4)",
        [evaluationId, orgId, projectId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const suiteVersionId = await suiteVersion(orgId, projectId, pack.cases);
    await owner.query("UPDATE evals.evaluation SET selected_suite_version_id=$2 WHERE id=$1", [evaluationId, suiteVersionId]);
    return { orgId, projectId, evaluationId, revisionId, suiteVersionId, cases: pack.cases, ownerUser, outsideOwner, viewer, mutedViewer, operator,
      ownerScope: { orgId, actorId: ownerUser.id }, operatorScope: { orgId, actorId: operator.id }, system: { orgId, actorId: SCHEDULER } };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;

  /** A frozen test set of these cases (deployed system). */
  async function suiteVersion(orgId: string, projectId: string, cases: Array<{ case_id: string; revision_id: string; content_hash: string; family_id: string; split: string }>) {
    const suiteId = randomUUID(), suiteVersionId = randomUUID();
    const manifest = withContentHash({ schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, execution_mode: "deployed_system", fixture_revisions: [],
      case_revisions: cases.map(item => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split })),
      source_revisions: [], rubric_revisions: [], output_schema_revisions: [], files: [] });
    await owner.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Approved')", [suiteId, orgId, projectId]);
    await owner.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
    for (const [ordinal, item] of cases.entries()) await owner.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
    return suiteVersionId;
  }

  const monthly = (f: Fixture, extra: Record<string, unknown> = {}) => ({ evaluationId: f.evaluationId, targetRevisionId: f.revisionId, suiteVersionId: f.suiteVersionId,
    timezone: "Europe/Madrid", cadence: "monthly", localTime: "09:00", weekday: null, dayOfMonth: 1, maxRunSpend: "10", currency: "EUR", sourceMaxAgeDays: null, ...extra });

  /** Makes the slot of `month` (YYYY-MM, the 1st at 09:00 Madrid) due and runs one schedule tick as the scheduler. */
  async function tickSlot(f: Fixture, scheduleId: string, month: string, deps: Parameters<typeof tickSchedules>[2] = {}) {
    const due = new Date(`${month}-01T07:00:00Z`);
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at=$2 WHERE id=$1", [scheduleId, due]);
    await tickSchedules(f.system, new Date(due.getTime() + 3_600_000).toISOString(), deps);
    return (await owner.query("SELECT * FROM evals.schedule_dispatch WHERE schedule_id=$1 AND local_slot_key=$2", [scheduleId, `${month}-01T09:00`])).rows[0];
  }

  const grant = (orgId: string, ucr: bigint) => withTenant({ orgId, actorId: SCHEDULER }, db => grantCredits(db, { orgId, key: `grant-${randomUUID()}`, amountUcr: ucr, source: "grant", reason: "L-18 fixture" }));
  const observation = (input: CandidateInput, context: { run_id: string; attempt_id: string; target_revision_id: string }) => {
    const unknown = { value: null, provenance: "unavailable" as const };
    return withContentHash({ schema_version: "1.0" as const, observation_id: randomUUID(), run_id: context.run_id, case_revision_id: input.case_revision_id, repetition: 0,
      attempt_id: context.attempt_id, target_revision_id: context.target_revision_id, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      messages: [...input.messages, { role: "assistant" as const, content: "An answer." }], tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded" as const, error: null,
      metadata: { latency_ms: { value: 1, provenance: "measured" as const }, input_tokens: unknown, output_tokens: unknown, cost: unknown, model_identity: unknown }, extensions: {} });
  };
  /** Runs every target step of a run with the real target worker (the system is a fake that always answers). */
  async function execute(f: Fixture, runId: string, mode: Mode) {
    const worker = new TargetExecutionWorker({ tx, keys: new Map(), actorId: WORKER, workerId: randomUUID(), billing: () => mode, execute: async (_config, input, context) => observation(input, context) });
    const steps = (await owner.query(`SELECT s.id,s.input_hash FROM evals.workflow_step s JOIN evals.execution_workflow w ON (w.org_id,w.id)=(s.org_id,s.workflow_id)
      WHERE w.run_id=$1 ORDER BY s.created_at,s.id`, [runId])).rows;
    for (const step of steps) await worker.handle({ orgId: f.orgId, stepId: step.id, inputHash: step.input_hash });
  }
  /** Grades a finished run, then a person decides each answer (pass/partial/fail by question title), and the run is marked done. */
  async function decide(f: Fixture, runId: string, outcomes: Record<string, "pass" | "partial" | "fail">) {
    await scoreRun(f.ownerScope, runId, "fixture-deterministic-v1");
    await owner.query("UPDATE evals.judge_job SET status='failed' WHERE run_id=$1 AND status='queued'", [runId]).catch(() => undefined);
    const rows = (await owner.query(`SELECT DISTINCT ON (a.observation_id) a.id,a.document,cr.document->>'title' AS title FROM evals.assessment a
      JOIN evals.observation o ON (o.org_id,o.id)=(a.org_id,a.observation_id) JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
      JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(cu.org_id,cu.case_revision_id) WHERE o.run_id=$1 ORDER BY a.observation_id,a.created_at DESC,a.id DESC`, [runId])).rows;
    for (const row of rows) {
      const outcome = outcomes[row.title] ?? "pass";
      await reviewAssessment(f.ownerScope, row.id, { decision: "override", reason: "Fixture decision", outcome,
        criteria: row.document.criteria.map((item: { criterion_id: string; rationale: string }) => ({ ...item, score: outcome === "pass" ? 1 : outcome === "partial" ? 0.5 : 0 })) });
    }
    await owner.query("UPDATE evals.run SET status='completed',phase='done' WHERE id=$1", [runId]);
  }
  const notices = async (orgId: string, kind: string) => (await owner.query("SELECT kind,event_id,payload FROM evals.notification WHERE org_id=$1 AND kind=$2 ORDER BY created_at,id", [orgId, kind])).rows;

  /* --------------------------------------------------------------- tests --- */

  it("lets a pay-as-you-go owner schedule monthly with a credit limit; weekly or monthly only; limits are the owners' and audited", async () => {
    setMode("shadow");
    const f = await seed();
    const created = await createSchedule(f.ownerScope, monthly(f, { creditCapCredits: 500 }), `create-${randomUUID()}`);
    expect(created).toMatchObject({ status: "active", creditCapCredits: 500 });
    const cap = (await owner.query("SELECT scope,subject_id,cap_ucr FROM billing.spend_cap WHERE org_id=$1 AND scope='schedule'", [f.orgId])).rows;
    expect(cap).toEqual([{ scope: "schedule", subject_id: created.id, cap_ucr: String(creditsToUcr(500)) }]);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action='billing.spend_cap_saved'", [f.orgId])).rows[0].n).toBe(1);
    expect((await listSchedules(f.ownerScope))[0]).toMatchObject({ id: created.id, cadence: "monthly", credit_cap_ucr: String(creditsToUcr(500)) });
    // Credits workspaces schedule weekly or monthly.
    await expect(createSchedule(f.ownerScope, monthly(f, { cadence: "daily", dayOfMonth: null }), `daily-${randomUUID()}`)).rejects.toMatchObject({ code: "INPUT_INVALID", status: 422 });
    const weekly = await createSchedule(f.ownerScope, monthly(f, { cadence: "weekly", weekday: 1, dayOfMonth: null }), `weekly-${randomUUID()}`);
    expect(weekly.creditCapCredits).toBeNull();
    // An operator may schedule, but a credit limit is the owners' (set_spend_cap), and nothing is half-saved.
    await expect(createSchedule(f.operatorScope, monthly(f, { creditCapCredits: 100 }), `op-${randomUUID()}`)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 403 });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.monitor_schedule WHERE org_id=$1", [f.orgId])).rows[0].n).toBe(2);
    // Changing the limit keeps the schedule's version (its slots stay valid); null removes it.
    const updated = await updateSchedule(f.ownerScope, created.id, { expectedVersion: created.version, creditCapCredits: 800 });
    expect(updated).toMatchObject({ version: created.version, credit_cap_ucr: String(creditsToUcr(800)) });
    expect((await updateSchedule(f.ownerScope, created.id, { expectedVersion: created.version, creditCapCredits: null })).credit_cap_ucr).toBeNull();
    // A schedule cap must name a schedule of this workspace.
    const other = await seed();
    await expect(withTenant(f.ownerScope, db => db.query("SELECT billing.set_spend_cap($1,'schedule',$2,1000000,NULL,NULL)", [f.orgId, randomUUID()]))).rejects.toThrow("INPUT_INVALID");
    const foreign = await createSchedule(other.ownerScope, monthly(other), `foreign-${randomUUID()}`);
    await expect(withTenant(f.ownerScope, db => db.query("SELECT billing.set_spend_cap($1,'schedule',$2,1000000,NULL,NULL)", [f.orgId, foreign.id]))).rejects.toThrow("INPUT_INVALID");
    // Managed (contract) workspaces keep daily schedules and have no credit limits.
    const managed = await seed({ plan: "managed" });
    await createSchedule(managed.ownerScope, monthly(managed, { cadence: "daily", dayOfMonth: null }), `managed-${randomUUID()}`);
    await expect(createSchedule(managed.ownerScope, monthly(managed, { creditCapCredits: 100 }), `managed-cap-${randomUUID()}`)).rejects.toMatchObject({ code: "INPUT_INVALID", status: 422 });
    // Free workspaces cannot schedule (plans v2 `can_schedule` is the PAYG/managed switch).
    await owner.query("UPDATE evals.workspace_entitlement SET plan='free',can_schedule=false WHERE org_id=$1", [other.orgId]);
    await expect(createSchedule(other.ownerScope, monthly(other), `free-${randomUUID()}`)).rejects.toMatchObject({ status: 403 });
  }, 60_000);

  it("skips a slot the balance cannot cover where credits are enforced, alerts owners once, and only records it in shadow mode", async () => {
    setMode("enforce");
    const f = await seed();
    const schedule = await createSchedule(f.ownerScope, monthly(f), `create-${randomUUID()}`);
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };
    // Catch-up: three months missed, only the latest slot runs (unchanged rule).
    await owner.query("UPDATE evals.monitor_schedule SET next_due_at='2026-06-01T07:00:00Z' WHERE id=$1", [schedule.id]);
    await tickSchedules(f.system, "2026-09-01T08:00:00.000Z", { send });
    const slots = (await owner.query("SELECT * FROM evals.schedule_dispatch WHERE schedule_id=$1", [schedule.id])).rows;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ local_slot_key: "2026-09-01T09:00", missed_slots: 3, status: "skipped", reason_code: "credits_exhausted", run_id: null });
    const admission = slots[0].admission as ScheduleAdmission;
    expect(admission).toMatchObject({ mode: "enforce", billingMode: "credits", verdict: "credits_exhausted", availableUcr: "0", scheduleCapUcr: null });
    expect(B(admission.p90Ucr) > BigInt(0)).toBe(true);
    // One notice and one email to the Caudals owner; the other owner's address is outside Caudals (Stripe test mode).
    const skipped = await notices(f.orgId, "schedule_skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].payload).toMatchObject({ reason: "credits_exhausted", available: 0, evaluationTitle: "Support assistant", scheduleId: schedule.id });
    expect(skipped[0].payload.needed).toBeGreaterThan(0);
    expect(sent.map(message => message.to)).toEqual([f.ownerUser.email]);
    expect(sent[0].subject).toBe("A scheduled Caudals run was skipped: not enough credits");
    expect(sent[0].text).toContain("Support assistant");
    // Deduplicated: further ticks neither re-alert nor re-send.
    await tickSchedules(f.system, "2026-09-01T08:05:00.000Z", { send });
    expect(sent).toHaveLength(1);
    expect(await notices(f.orgId, "schedule_skipped")).toHaveLength(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.run WHERE org_id=$1", [f.orgId])).rows[0].n).toBe(0);
    // In the app: owners and editors see it (billing), the schedule shows why.
    expect((await listSchedules(f.ownerScope))[0]).toMatchObject({ latest_dispatch_status: "skipped", latest_dispatch_reason: "credits_exhausted" });

    // The 095 rollback refuses once a dispatch recorded an admission (the evidence behind the alert).
    const client = await owner.connect();
    try {
      await expect(client.query(await readFile(new URL("../../db/rollbacks/095_evals_schedule_credits_down.sql", import.meta.url), "utf8"))).rejects.toThrow("Rollback blocked");
    } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
    expect((await owner.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='evals' AND table_name='schedule_dispatch' AND column_name='admission'")).rows[0].n).toBe(1);

    // Shadow mode: the same verdict is recorded, nobody is alerted, and the run goes ahead.
    setMode("shadow");
    const shadowSlot = await tickSlot(f, schedule.id, "2026-10", { send });
    expect(shadowSlot).toMatchObject({ status: "started", reason_code: null });
    expect(shadowSlot.admission).toMatchObject({ mode: "shadow", verdict: "credits_exhausted" });
    expect(sent).toHaveLength(1);
    expect(await notices(f.orgId, "schedule_skipped")).toHaveLength(1);
  }, 60_000);

  it("charges scheduled runs through the engine path, with shadow parity, and holds them to the schedule's limit at dispatch and while running", async () => {
    setMode("enforce");
    const f = await seed();
    const schedule = await createSchedule(f.ownerScope, monthly(f, { creditCapCredits: 1_000_000 }), `create-${randomUUID()}`);
    await grant(f.orgId, creditsToUcr(5000));
    const first = await tickSlot(f, schedule.id, "2026-05");
    expect(first).toMatchObject({ status: "started", reason_code: null });
    expect(first.admission).toMatchObject({ mode: "enforce", verdict: "admit", scheduleSpentUcr: "0" });
    expect((await owner.query("SELECT price_book_revision_id IS NOT NULL AS frozen,created_by FROM evals.run WHERE id=$1", [first.run_id])).rows[0].frozen).toBe(true);
    await execute(f, first.run_id, "enforce");
    await owner.query("UPDATE evals.run SET status='completed',phase='done' WHERE id=$1", [first.run_id]);
    // Every answered question is metered on the run (L-11), and the schedule's month spend is exactly that.
    const charged = (await owner.query("SELECT meter,amount_ucr,run_id FROM billing.ledger_entry WHERE org_id=$1 AND entry_type='action' ORDER BY account_version", [f.orgId])).rows;
    expect(charged).toHaveLength(3);
    expect(charged.every(row => row.meter === "api_question" && row.run_id === first.run_id)).toBe(true);
    const spent = charged.reduce((sum, row) => sum - B(row.amount_ucr), BigInt(0));
    expect(await withTenant(f.ownerScope, db => scheduleMonthSpendUcr(db, f.orgId, schedule.id))).toBe(spent);

    // Shadow parity: the same scheduled run in shadow mode writes the same amounts to the shadow ledger, and no ledger entry.
    setMode("shadow");
    const twin = await seed();
    const twinSchedule = await createSchedule(twin.ownerScope, monthly(twin), `create-${randomUUID()}`);
    const twinSlot = await tickSlot(twin, twinSchedule.id, "2026-05");
    expect(twinSlot.status).toBe("started");
    expect(B(twinSlot.admission.p90Ucr)).toBe(B(first.admission.p90Ucr));
    await execute(twin, twinSlot.run_id, "shadow");
    const shadowed = (await owner.query("SELECT meter,amount_ucr FROM billing.shadow_entry WHERE org_id=$1 AND kind='action' ORDER BY created_at,id", [twin.orgId])).rows;
    expect(shadowed.map(row => [row.meter, B(row.amount_ucr)])).toEqual(charged.map(row => [row.meter, -B(row.amount_ucr)]));
    expect((await owner.query("SELECT count(*)::int AS n FROM billing.ledger_entry WHERE org_id=$1 AND entry_type IN ('action','capture')", [twin.orgId])).rows[0].n).toBe(0);

    // At dispatch: a limit the next run would pass skips the slot with cap_reached and alerts once.
    setMode("enforce");
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, creditCapCredits: Number(spent / creditsToUcr(1)) + 1 });
    const capped = await tickSlot(f, schedule.id, "2026-06", { send });
    expect(capped).toMatchObject({ status: "skipped", reason_code: "cap_reached", run_id: null });
    expect(capped.admission).toMatchObject({ verdict: "cap_reached", capScope: "schedule", scheduleSpentUcr: spent.toString() });
    expect((await notices(f.orgId, "schedule_skipped")).map(row => row.payload)).toEqual([expect.objectContaining({ reason: "cap_reached", capScope: "schedule", cap: Number(spent / creditsToUcr(1)) + 1 })]);
    expect(sent.map(message => message.subject)).toEqual(["A scheduled Caudals run was skipped: credit limit reached"]);

    // While running: a scheduled run stops once its schedule's runs reach the limit (billing watch), and the owners hear once.
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, creditCapCredits: 1_000_000 });
    const second = await tickSlot(f, schedule.id, "2026-07");
    expect(second.status).toBe("started");
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: schedule.version, creditCapCredits: Number(spent / creditsToUcr(1)) });
    const env = { ...process.env, BILLING_CREDITS_ENABLED: "true", BILLING_ENFORCE: "enforce" };
    const watch = await runBillingWatch(f.system, { env, send, processMode: "enforce" });
    expect(watch.paused).toBe(1);
    expect(watch.alerts).toContain("cap_reached:schedule");
    expect((await owner.query("SELECT status,reason_code FROM evals.run WHERE id=$1", [second.run_id])).rows[0]).toMatchObject({ reason_code: "cap_reached" });
    expect((await runBillingWatch(f.system, { env, send, processMode: "enforce" })).alerts).not.toContain("cap_reached:schedule");
    expect((await notices(f.orgId, "cap_reached")).map(row => row.payload)).toEqual([expect.objectContaining({ scope: "schedule", scheduleId: schedule.id })]);
  }, 120_000);

  it("summarises every scheduled run against the last one, emails each person once, and never alerts when runs cannot be compared", async () => {
    setMode("off");
    process.env.BRANDED_EMAILS_ENABLED = "true";
    process.env.EVALS_APP_URL = "https://app.caudals.test";
    const f = await seed();
    const schedule = await createSchedule(f.ownerScope, monthly(f), `create-${randomUUID()}`);
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage) => { sent.push(message); return { id: randomUUID() }; };

    // First scheduled run: nothing to compare with yet.
    const first = await tickSlot(f, schedule.id, "2026-05");
    await execute(f, first.run_id, "off");
    await decide(f, first.run_id, { "Management fee": "pass", "Custody fee": "pass", Instalments: "fail" });
    expect(await tickScheduledAlerts(f.system)).toBe(1);
    const firstAlert = (await owner.query("SELECT status,reason_codes,evidence->'summary' AS summary FROM evals.regression_alert WHERE schedule_dispatch_id=$1", [first.id])).rows[0];
    expect(firstAlert).toMatchObject({ status: "inconclusive", reason_codes: ["no_baseline"], summary: { comparable: false, baseline: null, newlyBroken: [] } });

    // Second: two questions broke and one was fixed.
    const second = await tickSlot(f, schedule.id, "2026-06");
    await execute(f, second.run_id, "off");
    await decide(f, second.run_id, { "Management fee": "fail", "Custody fee": "partial", Instalments: "pass" });
    await tickScheduledAlerts(f.system);
    const alert = (await owner.query("SELECT status,evidence->'summary' AS summary FROM evals.regression_alert WHERE schedule_dispatch_id=$1", [second.id])).rows[0];
    expect(alert.status).toBe("regression");
    expect(alert.summary).toMatchObject({ comparable: true, newlyBrokenTotal: 2, fixedTotal: 1, candidate: { score: { pass: 1, scored: 3 } }, baseline: { score: { pass: 2, scored: 3 } } });
    expect(alert.summary.newlyBroken.map((item: { title: string; before: string; after: string }) => [item.title, item.before, item.after]))
      .toEqual([["Management fee", "pass", "fail"], ["Custody fee", "pass", "partial"]]);
    const notice = (await notices(f.orgId, "monitor_regression"))[0];
    expect(notice.payload).toMatchObject({ evaluationTitle: "Support assistant", pass: 1, scored: 3, previousPass: 2, previousScored: 3, brokenTotal: 2, comparable: true });
    // Email: owners and the viewer who keeps regressions on, in one message each; not the operator, not the opted-out viewer.
    await deliverEmailNotifications(f.system, send);
    expect(sent.map(message => message.to).sort()).toEqual([f.ownerUser.email, f.outsideOwner.email, f.viewer.email].sort());
    expect(sent[0].subject).toBe("Support assistant: 2 questions got worse since the last run");
    expect(sent[0].text).toContain("Management fee:\nhttps://app.caudals.test/workspace/");
    expect(sent[0].text).toContain("Custody fee");
    expect(sent[0].text).toContain("Score this run: 33% (1 of 3 correct)");
    expect(sent.every(message => message.idempotencyKey?.startsWith("notification-"))).toBe(true);
    await deliverEmailNotifications(f.system, send);
    await tickScheduledAlerts(f.system);
    expect(sent).toHaveLength(3);
    expect(await notices(f.orgId, "monitor_regression")).toHaveLength(1);
    // The webhook event is unchanged (one per run, signed elsewhere).
    // "Run again": the comparison of the second run with the first, read-only, with the questions that moved.
    const comparison = await runComparison(f.ownerScope, second.run_id);
    expect(comparison).toMatchObject({ comparable: true, baseline: { runId: first.run_id }, counts: { improved: 1, regressed: 2, unchanged: 0 } });
    expect(comparison.changes.map(item => [item.title, item.direction])).toEqual([["Management fee", "regressed"], ["Custody fee", "regressed"], ["Instalments", "improved"]]);
    const focused = await runComparison(f.ownerScope, second.run_id, undefined, [comparison.changes[2].caseRevisionId]);
    expect(focused.focus).toEqual([expect.objectContaining({ title: "Instalments", before: "fail", after: "pass" })]);
    expect((await runComparison(f.ownerScope, first.run_id)).baseline).toBeNull();

    // A new approved test set: the next run is not comparable, so no regression alert and no email, whatever the scores.
    const newSuite = await suiteVersion(f.orgId, f.projectId, f.cases.slice(0, 2));
    await owner.query("UPDATE evals.evaluation SET selected_suite_version_id=$2 WHERE id=$1", [f.evaluationId, newSuite]);
    const current = (await listSchedules(f.ownerScope)).find(item => item.id === schedule.id)!;
    await updateSchedule(f.ownerScope, schedule.id, { expectedVersion: current.version, suiteVersionId: newSuite });
    const third = await tickSlot(f, schedule.id, "2026-07");
    expect(third.status).toBe("started");
    await execute(f, third.run_id, "off");
    await decide(f, third.run_id, { "Management fee": "fail", "Custody fee": "fail" });
    await tickScheduledAlerts(f.system);
    const incomparable = (await owner.query("SELECT status,reason_codes,evidence->'summary' AS summary FROM evals.regression_alert WHERE schedule_dispatch_id=$1", [third.id])).rows[0];
    expect(incomparable.status).toBe("inconclusive");
    expect(incomparable.reason_codes).toContain("suite_changed");
    expect(incomparable.summary).toMatchObject({ comparable: false, newlyBroken: [], newlyBrokenTotal: 0 });
    expect(await notices(f.orgId, "monitor_regression")).toHaveLength(1);
    await deliverEmailNotifications(f.system, send);
    expect(sent).toHaveLength(3);
    expect((await runComparison(f.ownerScope, third.run_id)).comparable).toBe(false);
  }, 120_000);
});
