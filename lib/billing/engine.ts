/**
 * Credit hooks on the execution path (launch spec v2 §6.8, §6.18; package L-11).
 *
 * The engine calls these inside the transactions it already runs, after the
 * euro budget locks (provider account → workspace and run budgets →
 * billing.credit_account → lots):
 *
 *   claim()          holdEngineCall     after reserve()        key attempt:<id>
 *   success          captureEngineCall  after settle()         rate × usage, capped at the hold
 *   failure, cancel,  releaseEngineCall  finishFailure, a cancel before dispatch, recover()
 *   not dispatched                      (unknown outcomes keep the hold; it expires after 24 h)
 *   observation,     chargeMeter        succeeded units (unit:<case_unit_id>), finalized sources,
 *   grade, source                       completed web searches
 *
 * Modes (read on the server at runtime, per call):
 *   off      BILLING_CREDITS_ENABLED is not "true": nothing runs, not even a query.
 *   shadow   the same maths is recorded in billing.shadow_entry. Each write runs
 *            in its own savepoint, never locks the credit account, never raises
 *            for a short balance (would_block records it) and swallows every
 *            error, so shadow mode cannot fail, pause or block a run.
 *   enforce  billing.hold/capture/release/charge_action move credits;
 *            CreditsExhausted goes down the pause path (credits_exhausted).
 * Contract workspaces (billing_mode = contract) never hold credits in enforce
 * mode (§6.8 step 7); shadow mode still records them, flagged contract, so the
 * shadow week can compare the maths on real internal runs.
 *
 * Per-workspace override (L-14, decision I-11): while the credit layer is on,
 * a platform admin can set a workspace to `shadow` or `enforce` whatever
 * BILLING_ENFORCE says (billing.workspace_override). Every hook resolves the
 * workspace's mode itself (workspaceEngineMode), so callers keep passing the
 * process mode. `off` stays off: BILLING_CREDITS_ENABLED=false is the kill
 * switch for every workspace. A capture or release follows its hold: a call
 * held in shadow mode is settled in shadow mode after a switch to enforce.
 *
 * The mode a run is admitted under is frozen on the run when it is created
 * (evals.run.billing_admission_mode, migration 111: withTenant passes the
 * process mode, the insert trigger applies the override). Shadow admissions
 * and the shadow diff classify runs by it (L-16b): a run admitted under an
 * `enforce` override is reconciled against the real ledger even after the
 * override goes back to `inherit`.
 *
 * The amounts come from the pure functions below in both modes, so the shadow
 * report is enforce-mode maths by construction.
 */
import type { PoolClient } from "pg";
import { EvalError } from "../evals/domain/errors";
import { billingCreditsEnabled, billingEnforceMode } from "./config";
import { estimateEvaluationRun } from "./estimate";
import { getWorkspaceOverride } from "./overrides";
import { assertWithinCaps, autoRechargeCover } from "./limits";
import {
  attemptHoldKey, BillingError, captureCredits, chargeAction, getCreditAccount, holdCredits, releaseCredits, type BillingMode,
} from "./ledger";
import type { ActionMeter } from "./price-book";
import { usageChargeUcr, wholeCreditsUp, type TokenRates } from "./units";

type Env = Record<string, string | undefined>;
const ZERO = BigInt(0);

export type EngineBillingMode = "off" | "shadow" | "enforce";
/** The credit layer's mode for this process, read at call time. */
export function engineBillingMode(env: Env = process.env): EngineBillingMode {
  return billingCreditsEnabled(env) ? billingEnforceMode(env) : "off";
}

let overrideFailures = 0;
/** Override lookups that failed since the process started (the process mode was used instead). */
export function overrideFailureCount() { return overrideFailures; }

/**
 * The credit mode for one workspace: its admin override (L-14) when the
 * credit layer is on, else the process mode. The lookup runs in a savepoint
 * and falls back to the process mode on any error, so it can never fail the
 * caller's transaction (shadow mode must not fail a run).
 */
export async function workspaceEngineMode(db: PoolClient, mode: EngineBillingMode, orgId: string): Promise<EngineBillingMode> {
  if (mode === "off" || !orgId) return mode;
  try {
    await db.query("SAVEPOINT billing_override");
  } catch {
    overrideFailures++;
    return mode;
  }
  try {
    const override = await getWorkspaceOverride(db, orgId);
    await db.query("RELEASE SAVEPOINT billing_override");
    return override.enforcement === "inherit" ? mode : override.enforcement;
  } catch (error) {
    overrideFailures++;
    console.warn(JSON.stringify({ event: "billing_override_error", code: code(error) }));
    try { await db.query("ROLLBACK TO SAVEPOINT billing_override"); await db.query("RELEASE SAVEPOINT billing_override"); } catch { /* the caller's transaction reports it */ }
    return mode;
  }
}

/** Engine roles charged as engine tokens (§6.3). Probes, target calls and connection checks are free. */
export const BILLED_ENGINE_ROLES: ReadonlySet<string> = new Set(["generator", "context_analyzer", "judge", "report_writer"]);

/* ---------------------------------------------------------------- maths --- */

export interface EnginePricing {
  billingMode: BillingMode;
  availableUcr: bigint;
  /** The run the work belongs to (refunds, usage by run), when there is one. */
  runId: string | null;
  priceBookRevisionId: string | null;
  free: boolean;
  /** µcr per 1M tokens for the call's prompt-size tier; null when the model has no rate. */
  rates: TokenRates | null;
}
export interface TokenBound { input: number; output: number }
export interface ChargedUsage { input: number; output: number; cached: number; provenance: "provider_reported" | "bounded_estimate" }

/**
 * The hold for one engine call (§6.8 step 2): the model rate × the call's
 * token bound (the same bound the euro reservation uses). Cached input can
 * cost more than uncached input, so the dearer input rate is held.
 */
export function engineHoldUcr(pricing: Pick<EnginePricing, "free" | "rates">, bound: TokenBound): bigint {
  if (pricing.free || !pricing.rates) return ZERO;
  const rates = pricing.rates;
  const input = rates.cachedUcrPerMillion !== undefined && rates.cachedUcrPerMillion > rates.inputUcrPerMillion
    ? rates.cachedUcrPerMillion : rates.inputUcrPerMillion;
  return usageChargeUcr({ input: bound.input, output: bound.output }, { inputUcrPerMillion: input, outputUcrPerMillion: rates.outputUcrPerMillion });
}

/** What a completed call costs (§6.8 step 3): rate × actual usage. The ledger caps it at the hold. */
export function engineChargeUcr(pricing: Pick<EnginePricing, "free" | "rates">, usage: Pick<ChargedUsage, "input" | "output" | "cached">): bigint {
  if (pricing.free || !pricing.rates) return ZERO;
  return usageChargeUcr({ input: usage.input, output: usage.output, cached: usage.cached }, pricing.rates);
}

/**
 * The usage a completed call is charged for: the provider's report, or when a
 * provider reports none, a bound that never exceeds the hold: the prompt
 * bound and the answer's UTF-8 bytes, at most the output cap.
 */
export function chargedUsage(reported: { input: number; output: number; cached?: number } | null | undefined, bound: TokenBound, outputBytes: number): ChargedUsage {
  if (reported) return { input: reported.input, output: reported.output, cached: reported.cached ?? 0, provenance: "provider_reported" };
  return { input: bound.input, output: Math.min(Math.max(0, Math.ceil(outputBytes)), bound.output), cached: 0, provenance: "bounded_estimate" };
}

/** A platform meter (§6.3): µcr per unit × quantity, exactly. */
export function meterChargeUcr(ucrPerUnit: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("invalid_quantity");
  return ucrPerUnit * BigInt(quantity);
}

/**
 * Pages a finalized source is metered for (§6.3): a website capture by the
 * pages read (its sections, at most the page limit), a PDF by its pages, any
 * other document by 3,000 characters a page. Always at least one.
 */
export const DOCUMENT_PAGE_CHARS = 3000;
export const WEBSITE_PAGE_SEPARATOR = "\n\n---\n\n";
export function sourcePageCount(text: string, kind: "website" | "document", options: { pageLimit?: number | null; extractionVersion?: string | null } = {}): number {
  if (kind === "website") {
    const sections = text.split(WEBSITE_PAGE_SEPARATOR).filter(section => section.trim()).length;
    return Math.max(1, Math.min(sections, options.pageLimit && options.pageLimit > 0 ? options.pageLimit : sections));
  }
  if (options.extractionVersion === "pdf-text-v1") return Math.max(1, (text.match(/^Page \d+:$/gm) ?? []).length);
  return Math.max(1, Math.ceil(text.length / DOCUMENT_PAGE_CHARS));
}

/** The §6.3 meter for one answered question by connection kind. */
export function questionMeter(kind: string | null | undefined, executionMode?: string | null): ActionMeter {
  if (executionMode === "imported_responses" || kind === "imported_responses") return "graded_answer";
  return kind === "website" ? "website_question" : "api_question";
}

/* ---------------------------------------------------------- database --- */

export interface EngineCallRef {
  orgId: string;
  attemptId: string;
  providerRevisionId: string;
  /** execution_workflow.run_id: a run's id for run workflows, the job or pass id otherwise. */
  workflowRunId?: string | null;
  generationJobId?: string | null;
  judgeJobId?: string | null;
  narrativeJobId?: string | null;
  caseUnitId?: string | null;
}

type Row = Record<string, unknown>;
const big = (value: unknown) => (value === null || value === undefined ? null : BigInt(value as string));

async function enginePricing(db: PoolClient, ref: EngineCallRef, inputTokens: number, revisionId: string | null = null): Promise<EnginePricing> {
  const row = (await db.query("SELECT * FROM billing.engine_pricing($1,$2,$3,$4,$5,$6,$7,$8)", [
    ref.orgId, ref.providerRevisionId, inputTokens, ref.workflowRunId ?? null, ref.generationJobId ?? null, ref.judgeJobId ?? null,
    ref.narrativeJobId ?? null, revisionId,
  ])).rows[0] as Row;
  const input = big(row.input_ucr_per_m), output = big(row.output_ucr_per_m), cached = big(row.cached_ucr_per_m);
  return {
    billingMode: row.billing_mode as BillingMode, availableUcr: big(row.available_ucr) ?? ZERO,
    runId: (row.run_id as string | null) ?? null, priceBookRevisionId: (row.price_book_revision_id as string | null) ?? null,
    free: row.free_model === true,
    rates: input !== null && output !== null ? { inputUcrPerMillion: input, outputUcrPerMillion: output, ...(cached !== null ? { cachedUcrPerMillion: cached } : {}) } : null,
  };
}

interface ActionPricing { billingMode: BillingMode; availableUcr: bigint; runId: string | null; priceBookRevisionId: string | null; ucrPerUnit: bigint | null }
async function actionPricing(db: PoolClient, orgId: string, meter: ActionMeter, runId: string | null): Promise<ActionPricing> {
  const row = (await db.query("SELECT * FROM billing.action_pricing($1,$2,$3,NULL)", [orgId, meter, runId])).rows[0] as Row;
  return {
    billingMode: row.billing_mode as BillingMode, availableUcr: big(row.available_ucr) ?? ZERO,
    runId: (row.run_id as string | null) ?? null, priceBookRevisionId: (row.price_book_revision_id as string | null) ?? null,
    ucrPerUnit: big(row.ucr_per_unit),
  };
}

/** A safe, snake_case code for logs: never message text or customer data. */
function code(error: unknown): string {
  if (error instanceof BillingError) return error.code;
  const sqlstate = (error as { code?: unknown } | null)?.code;
  if (typeof sqlstate === "string" && /^[0-9A-Z]{5}$/.test(sqlstate)) return `sqlstate_${sqlstate}`;
  const value = error instanceof Error ? error.message : "";
  return /^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(value) ? value : error instanceof Error ? error.name : "unknown";
}

let shadowFailures = 0;
/** Shadow writes that failed since the process started (a metric for tests and logs). */
export function shadowFailureCount() { return shadowFailures; }

/**
 * Runs one shadow write in its own savepoint and swallows every error: a
 * failed shadow write is logged and rolled back to the savepoint, and the
 * caller's transaction carries on exactly as if shadow mode were off.
 */
async function shadow(db: PoolClient, step: string, fn: () => Promise<unknown>): Promise<void> {
  try { await db.query("SAVEPOINT billing_shadow"); } catch (error) {
    shadowFailures++;
    console.warn(JSON.stringify({ event: "billing_shadow_error", step, code: code(error) }));
    return;
  }
  try {
    await fn();
    await db.query("RELEASE SAVEPOINT billing_shadow");
  } catch (error) {
    shadowFailures++;
    console.warn(JSON.stringify({ event: "billing_shadow_error", step, code: code(error) }));
    try { await db.query("ROLLBACK TO SAVEPOINT billing_shadow"); await db.query("RELEASE SAVEPOINT billing_shadow"); } catch { /* the caller's transaction reports it */ }
  }
}

/**
 * Enforce-mode capture and release run in a savepoint too: a hold that is no
 * longer open (expired after 24 h, released by recovery) is not a reason to
 * lose a finished answer. Any other error propagates.
 */
async function guarded(db: PoolClient, step: string, fn: () => Promise<unknown>): Promise<void> {
  await db.query("SAVEPOINT billing_settle");
  try {
    await fn();
    await db.query("RELEASE SAVEPOINT billing_settle");
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT billing_settle");
    await db.query("RELEASE SAVEPOINT billing_settle");
    if (error instanceof BillingError && ["HOLD_NOT_OPEN", "HOLD_NOT_FOUND"].includes(error.code)) {
      console.warn(JSON.stringify({ event: "billing_hold_not_open", step, code: error.code }));
      return;
    }
    throw error;
  }
}

/** §6.8 step 2: hold credits for an engine call, right after reserve() in claim(). */
export async function holdEngineCall(db: PoolClient, processMode: EngineBillingMode, ref: EngineCallRef, bound: TokenBound): Promise<void> {
  if (processMode === "off") return;
  const mode = await workspaceEngineMode(db, processMode, ref.orgId);
  const key = attemptHoldKey(ref.attemptId);
  if (mode === "shadow") {
    await shadow(db, "hold", async () => {
      const pricing = await enginePricing(db, ref, bound.input);
      const amount = engineHoldUcr(pricing, bound);
      if (amount <= ZERO) return;
      await db.query("SELECT billing.shadow_hold($1,$2,$3::bigint,$4,$5,$6,$7,$8,$9)", [ref.orgId, key, amount.toString(), pricing.runId,
        ref.attemptId, ref.caseUnitId ?? null, pricing.priceBookRevisionId, ref.providerRevisionId, { bound }]);
    });
    return;
  }
  const pricing = await enginePricing(db, ref, bound.input);
  if (pricing.billingMode === "contract") return;
  const amount = engineHoldUcr(pricing, bound);
  if (amount <= ZERO) return;
  await holdCredits(db, { orgId: ref.orgId, key, amountUcr: amount, runId: pricing.runId ?? undefined, attemptId: ref.attemptId,
    caseUnitId: ref.caseUnitId ?? undefined, priceBookRevisionId: pricing.priceBookRevisionId ?? undefined });
}

/** §6.8 step 3: charge a completed call, in the transaction that settles it. */
export async function captureEngineCall(db: PoolClient, processMode: EngineBillingMode, ref: EngineCallRef, usage: ChargedUsage): Promise<void> {
  if (processMode === "off") return;
  const mode = await workspaceEngineMode(db, processMode, ref.orgId);
  const key = attemptHoldKey(ref.attemptId);
  const shadowCapture = () => shadow(db, "capture", async () => {
    const hold = (await db.query("SELECT price_book_revision_id FROM billing.shadow_entry WHERE org_id=$1 AND kind='hold' AND entry_key=$2",
      [ref.orgId, key])).rows[0];
    if (!hold) return;
    const requested = engineChargeUcr(await enginePricing(db, ref, usage.input, hold.price_book_revision_id), usage);
    await db.query("SELECT billing.shadow_capture($1,$2,$3::bigint,$4,NULL)", [ref.orgId, key, requested.toString(), usage]);
  });
  if (mode === "shadow") {
    await shadowCapture();
    return;
  }
  const hold = (await db.query("SELECT state,price_book_revision_id FROM billing.credit_hold WHERE org_id=$1 AND hold_key=$2", [ref.orgId, key])).rows[0];
  // Nothing was held: a contract workspace, a free model, or a call claimed
  // before enforcement (held in shadow mode: settle it there).
  if (!hold) { await shadowCapture(); return; }
  if (hold.state !== "held") { console.warn(JSON.stringify({ event: "billing_hold_not_open", step: "capture", code: hold.state })); return; }
  const requested = engineChargeUcr(await enginePricing(db, ref, usage.input, hold.price_book_revision_id), usage);
  await guarded(db, "capture", () => captureCredits(db, { orgId: ref.orgId, key, amountUcr: requested, metadata: { usage } }));
}

/** §6.8 step 4: return the whole hold (failed, cancelled or never dispatched). */
export async function releaseEngineCall(db: PoolClient, processMode: EngineBillingMode, orgId: string, attemptId: string, reason: string): Promise<void> {
  if (processMode === "off") return;
  const mode = await workspaceEngineMode(db, processMode, orgId);
  const key = attemptHoldKey(attemptId);
  const shadowRelease = () => shadow(db, "release", () => db.query("SELECT billing.shadow_release($1,$2,$3)", [orgId, key, reason.slice(0, 200)]));
  if (mode === "shadow") {
    await shadowRelease();
    return;
  }
  const hold = (await db.query("SELECT state FROM billing.credit_hold WHERE org_id=$1 AND hold_key=$2", [orgId, key])).rows[0];
  if (!hold) { await shadowRelease(); return; } // held in shadow mode before a switch to enforce
  if (hold.state !== "held") return;
  await guarded(db, "release", () => releaseCredits(db, { orgId, key, reason }));
}

export interface MeterCharge {
  orgId: string;
  /** The idempotency key: unit:<case_unit_id>, source:<revision_id>, search:<attempt_id>. */
  key: string;
  meter: ActionMeter;
  quantity: number;
  runId?: string | null;
  caseUnitId?: string | null;
}
/**
 * §6.8 step 5: a platform meter for completed work, in the transaction that
 * records it. Enforce mode never refuses finished work: it charges what the
 * balance covers and returns the shortfall, so the caller pauses the run.
 */
export async function chargeMeter(db: PoolClient, processMode: EngineBillingMode, charge: MeterCharge): Promise<{ shortfallUcr: bigint }> {
  const none = { shortfallUcr: ZERO };
  if (processMode === "off" || charge.quantity <= 0) return none;
  const mode = await workspaceEngineMode(db, processMode, charge.orgId);
  if (mode === "shadow") {
    await shadow(db, "action", async () => {
      const pricing = await actionPricing(db, charge.orgId, charge.meter, charge.runId ?? null);
      if (pricing.ucrPerUnit === null) return;
      const amount = meterChargeUcr(pricing.ucrPerUnit, charge.quantity);
      if (amount <= ZERO) return;
      await db.query("SELECT billing.shadow_charge($1,'action',$2,$3,$4::bigint,$5::numeric,$6,$7,$8,NULL)", [charge.orgId, charge.key, charge.meter,
        amount.toString(), String(charge.quantity), pricing.runId, charge.caseUnitId ?? null, pricing.priceBookRevisionId]);
    });
    return none;
  }
  const pricing = await actionPricing(db, charge.orgId, charge.meter, charge.runId ?? null);
  if (pricing.billingMode === "contract" || pricing.ucrPerUnit === null) return none;
  const amount = meterChargeUcr(pricing.ucrPerUnit, charge.quantity);
  if (amount <= ZERO) return none;
  const entry = await chargeAction(db, { orgId: charge.orgId, key: charge.key, meter: charge.meter, amountUcr: amount, quantity: charge.quantity,
    runId: pricing.runId ?? undefined, caseUnitId: charge.caseUnitId ?? undefined, priceBookRevisionId: pricing.priceBookRevisionId ?? undefined,
    allowPartial: true });
  const shortfall = BigInt(String(entry.metadata.shortfall_ucr ?? 0));
  return { shortfallUcr: shortfall > ZERO ? shortfall : ZERO };
}

/**
 * Enforce mode only: whether the balance still covers one more unit of a
 * meter. Target work is charged after the answer, so this keeps a run from
 * starting units it cannot pay for. Contract workspaces always pass.
 */
export async function meterCovered(db: PoolClient, processMode: EngineBillingMode, orgId: string, meter: ActionMeter, runId: string | null): Promise<boolean> {
  if (processMode === "off") return true;
  const mode = await workspaceEngineMode(db, processMode, orgId);
  if (mode !== "enforce") return true;
  const pricing = await actionPricing(db, orgId, meter, runId);
  if (pricing.billingMode === "contract" || pricing.ucrPerUnit === null) return true;
  return pricing.availableUcr >= pricing.ucrPerUnit;
}

/* ------------------------------------------------------------ admission --- */

export interface AdmissionInput { evaluationId: string; suiteVersionId: string; targetRevisionId: string }
export interface AdmissionRun extends AdmissionInput { runId: string }

/**
 * §6.8 step 1: the credits a run must have available to start or resume, the
 * estimator's p90 (L-10) for the units still to run (all of them at start).
 */
export async function admissionRequirementUcr(db: PoolClient, orgId: string, run: AdmissionInput, remaining?: { units: number; total: number }): Promise<{ requiredUcr: bigint; p90Ucr: bigint; priceBookRevisionId: string | null }> {
  const estimate = await estimateEvaluationRun(db, orgId, { evaluationId: run.evaluationId, suiteVersionId: run.suiteVersionId, targetRevisionId: run.targetRevisionId });
  const p90 = BigInt(estimate.ucr.p90);
  const required = remaining && remaining.total > 0 && remaining.units < remaining.total
    ? (p90 * BigInt(Math.max(0, remaining.units)) + BigInt(remaining.total) - BigInt(1)) / BigInt(remaining.total)
    : p90;
  return { requiredUcr: required, p90Ucr: p90, priceBookRevisionId: estimate.priceBook.id };
}

/** The error a short balance raises at start or resume (enforce mode). */
export function creditsRequiredError(shortfallUcr: bigint) {
  const credits = wholeCreditsUp(shortfallUcr);
  return new EvalError("CREDITS_EXHAUSTED", 402, `Not enough credits for this run. Add ${credits.toString()} credits to continue.`);
}

/**
 * Enforce mode: refuses to start (or resume) a run whose p90 estimate the
 * available credits do not cover, unless auto-recharge covers the gap (§6.7,
 * L-15), or that would pass a spend cap (§6.10, L-15: CAP_REACHED). Contract
 * workspaces are never gated. Off and shadow modes return at once (shadow
 * admissions are recorded by the scheduler, off the request path:
 * recordShadowAdmission). `runId` is the run being resumed.
 */
export async function admitRun(db: PoolClient, processMode: EngineBillingMode, orgId: string, run: AdmissionInput, remaining?: { units: number; total: number }, runId?: string | null): Promise<void> {
  if (processMode === "off") return;
  const mode = await workspaceEngineMode(db, processMode, orgId);
  if (mode !== "enforce") return;
  const account = await getCreditAccount(db, orgId);
  if (!account || account.billingMode === "contract") return;
  const { requiredUcr, p90Ucr } = await admissionRequirementUcr(db, orgId, run, remaining);
  if (account.availableUcr < requiredUcr && !(await autoRechargeCover(db, orgId, requiredUcr - account.availableUcr)).covers) {
    throw creditsRequiredError(requiredUcr - account.availableUcr);
  }
  await assertWithinCaps(db, orgId, { requiredUcr, p90Ucr, heldUcr: account.heldUcr, runId });
}

/** Shadow mode: what admission would have required, and whether it would have refused. */
export async function recordShadowAdmission(db: PoolClient, orgId: string, run: AdmissionRun): Promise<boolean> {
  let recorded = false;
  await shadow(db, "admission", async () => {
    const { requiredUcr, priceBookRevisionId } = await admissionRequirementUcr(db, orgId, run);
    recorded = (await db.query("SELECT billing.shadow_charge($1,'admission',$2,NULL,$3::bigint,NULL,$4,NULL,$5,NULL) AS ok",
      [orgId, `admission:${run.runId}`, requiredUcr.toString(), run.runId, priceBookRevisionId])).rows[0].ok === true;
  });
  return recorded;
}

/**
 * A resume in shadow mode (L-11 follow-up, launch G2): enforce mode checks the
 * p90 of the units left at every resume (admitRun), so shadow mode records the
 * same admission (`admission:<run>:resume:<workflow event id>`, the event the
 * resume wrote, so each resume counts once) with the same requirement. Only
 * for runs admitted in shadow mode (the L-16b model: the mode frozen on the
 * run, else its charges, else the workspace's mode now); a run admitted under
 * enforce stays on the real ledger. Call it inside the resume's transaction,
 * after the workflow is re-queued; it runs in a savepoint and never raises.
 */
export async function recordShadowResumeAdmission(db: PoolClient, workspaceMode: EngineBillingMode, orgId: string,
  run: AdmissionRun & { workflowId: string }, remaining: { units: number; total: number }): Promise<boolean> {
  if (workspaceMode !== "shadow") return false;
  let recorded = false;
  await shadow(db, "resume_admission", async () => {
    const row = (await db.query(`SELECT coalesce(billing.run_admission_mode($1,$2),$3) AS mode,
        (SELECT max(e.id) FROM evals.execution_event e WHERE e.org_id=$1 AND e.workflow_id=$4 AND e.kind='queued')::text AS sequence`,
      [orgId, run.runId, workspaceMode, run.workflowId])).rows[0];
    if (row?.mode !== "shadow" || !row.sequence) return;
    const { requiredUcr, priceBookRevisionId } = await admissionRequirementUcr(db, orgId, run, remaining);
    recorded = (await db.query("SELECT billing.shadow_charge($1,'admission',$2,NULL,$3::bigint,NULL,$4,NULL,$5,NULL) AS ok",
      [orgId, `admission:${run.runId}:resume:${row.sequence}`, requiredUcr.toString(), run.runId, priceBookRevisionId])).rows[0].ok === true;
  });
  return recorded;
}

/**
 * Runs created in the last few minutes that were admitted in shadow mode and
 * have no shadow admission yet (the scheduler's tick). The mode is the one the
 * run was admitted under (evals.run.billing_admission_mode, frozen at insert;
 * L-16b), never the workspace's mode now: a run admitted under an `enforce`
 * override charges the real ledger even if the override is back to `inherit`
 * when the scheduler looks. Runs without a recorded mode (created before
 * migration 111) are classified by their charges (billing.run_admission_mode),
 * else by `workspaceMode`, the workspace's mode now.
 */
export async function pendingShadowAdmissions(db: PoolClient, orgId: string, workspaceMode: EngineBillingMode, withinMinutes = 5, limit = 20): Promise<AdmissionRun[]> {
  const rows = (await db.query(`SELECT r.id,r.evaluation_id,r.suite_version_id,r.target_revision_id FROM evals.run r
    WHERE r.org_id=$1 AND r.created_at > now()-$2::int*interval '1 minute' AND r.price_book_revision_id IS NOT NULL
      AND coalesce(billing.run_admission_mode(r.org_id,r.id),$4)='shadow'
      AND NOT EXISTS (SELECT 1 FROM billing.shadow_entry s WHERE s.org_id=r.org_id AND s.kind='admission' AND s.entry_key='admission:'||r.id)
    ORDER BY r.created_at LIMIT $3`, [orgId, withinMinutes, limit, workspaceMode])).rows;
  return rows.map(row => ({ runId: row.id, evaluationId: row.evaluation_id, suiteVersionId: row.suite_version_id, targetRevisionId: row.target_revision_id }));
}
