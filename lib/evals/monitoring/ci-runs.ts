import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { withTenant } from "../repositories/db";
import type { EvidenceScope } from "../repositories/evidence";
import { createSelfServiceRunInTransaction } from "../repositories/stage-c";
import { estimateEvaluationRun } from "../../billing/estimate";
import { consumeRateLimit, type RateLimitResult } from "@/lib/security/rate-limit";
import { CUSTOMER_API_LIMITS, type GateStatus } from "./customer-api";
import { reportForRun, runOutcomeRows, scoreOf, type OutcomeRow } from "./summary";
import { CustomerApiRateLimited } from "./tokens";
import { gateThresholdSchema } from "./gate-threshold";

/**
 * The CI trigger and release gate (launch L-19, spec v2 P-27, §6.7, §6.10).
 *
 * `startApiRun`: a pipeline's `runs:write` token starts one run of an
 * evaluation's approved test set version on a system version. The run is
 * created by the product's own path (`createSelfServiceRunInTransaction`), so
 * the plan's run allowance and connection types, the euro budgets, the credit
 * admission (the L-10 estimator's p90 where credits are enforced, L-11) and
 * the monthly and per-run caps (L-15) apply exactly as for a person pressing
 * Run. Each Idempotency-Key starts exactly one run per workspace: the key is
 * locked for the transaction (concurrent retries wait), and the run and its
 * `api_run_request` row commit together; a replay answers with the same run,
 * a key reused for another request is refused. New runs are limited per
 * workspace and hour on top of the per-token request limit. The run's
 * `created_by` and the audit event name the token.
 *
 * `runGate`: pass or fail against the threshold set on the schedule that
 * started the run or on its test set; unknown when the run could not give a
 * result; pending while it runs or is graded.
 */

export const startApiRunSchema = z.strictObject({
  suiteVersionId: z.uuid(),
  targetRevisionId: z.uuid(),
  /** Needed only when several evaluations have this test set version approved. */
  evaluationId: z.uuid().optional(),
});
export type StartApiRunInput = z.infer<typeof startApiRunSchema>;

/** The actor a token's writes are recorded under (runs.created_by, audit events). */
export const tokenActor = (tokenId: string) => `customer-api-token:${tokenId}`;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,200}$/;

export type ApiRunView = {
  run_id: string; evaluation_id: string; suite_version_id: string; target_revision_id: string; status: string; replayed: boolean;
  /** The release gate for this run, relative to the API base. */
  gate_url: string;
  /** The L-10 estimate in whole credits where the workspace pays with credits (null on contracts or when it cannot be priced). */
  estimate: { credits: { p50: string; p90: string } } | null;
};

export interface StartApiRunDeps { limit?: (input: { key: string; limit: number; windowMs: number }) => Promise<RateLimitResult> }

function view(row: Record<string, unknown>, orgId: string, replayed: boolean, estimate: ApiRunView["estimate"]): ApiRunView {
  const runId = String(row.run_id);
  return {
    run_id: runId, evaluation_id: String(row.evaluation_id), suite_version_id: String(row.suite_version_id), target_revision_id: String(row.target_revision_id),
    status: String(row.status), replayed, gate_url: `/api/evals/v1/integrations/runs/${runId}/gate?orgId=${orgId}`, estimate,
  };
}

async function evaluationFor(db: PoolClient, orgId: string, input: StartApiRunInput): Promise<string> {
  if (input.evaluationId) return input.evaluationId;
  const rows = (await db.query(`SELECT id FROM evals.evaluation WHERE org_id=$1 AND selected_suite_version_id=$2
    AND preparation_status='ready' AND archived_at IS NULL ORDER BY created_at,id LIMIT 2`, [orgId, input.suiteVersionId])).rows;
  if (!rows.length) throw new EvalError("SCOPE_DENIED", 404, "No evaluation has this test set version approved.");
  if (rows.length > 1) throw new EvalError("INPUT_INVALID", 422, "Several evaluations use this test set version. Send evaluationId too.");
  return String(rows[0].id);
}

/** The L-10 estimate for the run, in a savepoint so a pricing gap never stops the run (admission decides). */
async function estimateFor(db: PoolClient, orgId: string, input: { evaluationId: string; suiteVersionId: string; targetRevisionId: string }) {
  const mode = (await db.query("SELECT billing_mode FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0]?.billing_mode;
  if (!mode || mode === "contract") return null;
  await db.query("SAVEPOINT api_run_estimate");
  try {
    const estimate = await estimateEvaluationRun(db, orgId, input);
    await db.query("RELEASE SAVEPOINT api_run_estimate");
    return { credits: { p50: estimate.credits.p50, p90: estimate.credits.p90 } };
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT api_run_estimate");
    return null;
  }
}

export async function startApiRun(orgId: string, tokenId: string, raw: unknown, key: string | null, deps: StartApiRunDeps = {}): Promise<ApiRunView> {
  const input = startApiRunSchema.parse(raw);
  if (!key || !IDEMPOTENCY_KEY.test(key)) throw new EvalError("INPUT_INVALID", 400, "Send an Idempotency-Key header of 8 to 200 visible characters, the same on every retry.");
  const hash = sha256(canonicalJson(input));
  const scope: EvidenceScope = { orgId, actorId: tokenActor(tokenId) };
  const limit = deps.limit ?? consumeRateLimit;
  return withTenant(scope, async db => {
    // One key at a time per workspace: a concurrent retry waits here, then finds the run below.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["api-run", orgId, key])]);
    const existing = (await db.query(`SELECT a.request_hash,a.run_id,r.evaluation_id,r.suite_version_id,r.target_revision_id,r.status
      FROM evals.api_run_request a JOIN evals.run r ON (r.org_id,r.id)=(a.org_id,a.run_id)
      WHERE a.org_id=$1 AND a.idempotency_key=$2`, [orgId, key])).rows[0];
    if (existing) {
      if (existing.request_hash !== hash) throw new EvalError("IDEMPOTENCY_CONFLICT", 409, "This Idempotency-Key was used for another request. Use a new key for a new run.");
      return view(existing, orgId, true, null);
    }
    const target = (await db.query("SELECT document->>'kind' AS kind FROM evals.target_revision WHERE org_id=$1 AND id=$2", [orgId, input.targetRevisionId])).rows[0];
    if (!target) throw new EvalError("SCOPE_DENIED", 404, "System version not found.");
    if (target.kind === "imported_responses") throw new EvalError("INPUT_INVALID", 422, "Runs on collected answers start in the app, where the answers are uploaded.");
    const evaluationId = await evaluationFor(db, orgId, input);
    const allowed = await limit({ key: `customer-api-runs:${orgId}`, limit: CUSTOMER_API_LIMITS.runStartsPerHour, windowMs: 3_600_000 });
    if (!allowed.allowed) throw new CustomerApiRateLimited(allowed.retryAfterSeconds);
    const selection = { evaluationId, suiteVersionId: input.suiteVersionId, targetRevisionId: input.targetRevisionId };
    const estimate = await estimateFor(db, orgId, selection);
    // The product's run path: allowance, connection types, budgets, credit admission and caps.
    const created = await createSelfServiceRunInTransaction(db, scope, selection, `api-run:${sha256(`${orgId}:${key}`)}`) as { id: string };
    const run = (await db.query("SELECT id AS run_id,evaluation_id,suite_version_id,target_revision_id,status FROM evals.run WHERE org_id=$1 AND id=$2", [orgId, created.id])).rows[0];
    if (!run) throw new EvalError("SERVICE_UNAVAILABLE", 503);
    await db.query("INSERT INTO evals.api_run_request(org_id,idempotency_key,request_hash,token_id,run_id) VALUES($1,$2,$3,$4,$5)", [orgId, key, hash, tokenId, run.run_id]);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'run.started_via_api',$3,$4)",
      [orgId, scope.actorId, run.run_id, { token_id: tokenId, key_sha256: sha256(key), evaluation_id: evaluationId, suite_version_id: input.suiteVersionId, target_revision_id: input.targetRevisionId }]);
    return view(run, orgId, false, estimate);
  });
}

/* ------------------------------------------------------------------ gate --- */

export type GateInput = {
  runStatus: string; phase: string; reasonCode: string | null; stale: boolean;
  threshold: number | null; rows: OutcomeRow[];
};
export type GateVerdict = { status: GateStatus; reasons: string[]; score: { pass: number; scored: number; percent: number } | null };

/** A run counts only when at least 90 % of its questions were graded and every critical one was (as the regression alerts require). */
export const GATE_MIN_COVERAGE = 0.9;

export function gateVerdict(input: GateInput): GateVerdict {
  const scoreValue = () => {
    const score = scoreOf(input.rows);
    return score.scored ? { ...score, percent: Math.round((score.pass / score.scored) * 1000) / 10 } : null;
  };
  if (input.runStatus === "failed") return { status: "unknown", reasons: ["run_failed"], score: null };
  if (input.runStatus === "canceled" || input.runStatus === "cancel_requested") return { status: "unknown", reasons: ["run_canceled"], score: null };
  if (input.runStatus === "paused" || input.runStatus === "pause_requested") {
    const reason = input.reasonCode === "credits_exhausted" || input.reasonCode === "cap_reached" ? input.reasonCode : "run_paused";
    return { status: "unknown", reasons: [reason], score: null };
  }
  if (input.runStatus !== "completed" && input.runStatus !== "partial") return { status: "pending", reasons: ["run_in_progress"], score: null };
  if (input.phase !== "done" && !input.stale) return { status: "pending", reasons: ["grading"], score: null };
  const planned = input.rows.length, graded = input.rows.filter(row => row.outcome !== null).length;
  const criticalMissing = input.rows.some(row => row.severity === "critical" && row.outcome === null);
  const score = scoreValue();
  if (!planned || graded / planned < GATE_MIN_COVERAGE) return { status: "unknown", reasons: ["coverage_inadequate"], score };
  if (criticalMissing) return { status: "unknown", reasons: ["critical_unassessed"], score };
  if (!score) return { status: "unknown", reasons: ["no_scored_answers"], score: null };
  if (input.threshold === null) return { status: "unknown", reasons: ["threshold_not_set"], score };
  // Exact: pass/scored ≥ threshold %, the threshold having at most two decimals.
  const passes = score.pass * 10_000 >= Math.round(input.threshold * 100) * score.scored;
  return passes ? { status: "pass", reasons: [], score } : { status: "fail", reasons: ["below_threshold"], score };
}

export async function runGate(orgId: string, runId: string) {
  return withTenant({ orgId, actorId: "customer-api-token" }, async db => {
    const run = (await db.query(`SELECT r.id,r.status,r.phase,r.reason_code,r.updated_at<now()-interval '30 minutes' AS stale,
        s.gate_threshold AS suite_threshold,ms.gate_threshold AS schedule_threshold
      FROM evals.run r
      JOIN evals.suite_version sv ON (sv.org_id,sv.id)=(r.org_id,r.suite_version_id)
      JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
      LEFT JOIN LATERAL (SELECT d.schedule_id FROM evals.schedule_dispatch d WHERE d.org_id=r.org_id AND d.run_id=r.id ORDER BY d.scheduled_for DESC LIMIT 1) d ON true
      LEFT JOIN evals.monitor_schedule ms ON (ms.org_id,ms.id)=(r.org_id,d.schedule_id)
      WHERE r.org_id=$1 AND r.id=$2`, [orgId, runId])).rows[0];
    if (!run) throw new EvalError("SCOPE_DENIED", 404, "Run not found.");
    const source = run.schedule_threshold !== null ? "schedule" as const : run.suite_threshold !== null ? "test_set" as const : null;
    const threshold = source === "schedule" ? Number(run.schedule_threshold) : source === "test_set" ? Number(run.suite_threshold) : null;
    const finished = ["completed", "partial"].includes(run.status);
    const rows = finished ? await runOutcomeRows(db, orgId, runId) : [];
    const verdict = gateVerdict({ runStatus: run.status, phase: run.phase, reasonCode: run.reason_code, stale: run.stale === true, threshold, rows });
    return {
      run_id: runId, status: verdict.status, score: verdict.score, threshold, threshold_source: source, run_status: String(run.status),
      reason_codes: verdict.reasons, report_id: finished ? await reportForRun(db, orgId, runId) : null,
    };
  });
}

/* ------------------------------------------------------------- thresholds --- */


/** Approved test sets with their thresholds (Settings → Developers → Release gate). */
export function listGateThresholds(scope: EvidenceScope) {
  return withTenant(scope, async db => (await db.query(`SELECT e.id AS evaluation_id,e.title AS evaluation_title,
      e.selected_suite_version_id AS suite_version_id,e.selected_target_revision_id AS target_revision_id,
      s.id AS suite_id,s.title AS suite_title,s.gate_threshold::float8 AS gate_threshold
    FROM evals.evaluation e
    JOIN evals.suite_version sv ON (sv.org_id,sv.id)=(e.org_id,e.selected_suite_version_id)
    JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
    WHERE e.org_id=$1 AND e.preparation_status='ready' AND e.archived_at IS NULL AND s.archived_at IS NULL
    ORDER BY e.updated_at DESC,e.id LIMIT 100`, [scope.orgId])).rows);
}

/** Sets (or removes) a test set's pass threshold. Audited (`gate.threshold_saved`). */
export async function saveSuiteGateThreshold(scope: EvidenceScope, suiteId: string, raw: unknown) {
  const threshold = gateThresholdSchema.parse(raw);
  return withTenant(scope, async db => {
    const before = (await db.query("SELECT gate_threshold::float8 AS gate_threshold FROM evals.suite WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, suiteId])).rows[0];
    if (!before) throw new EvalError("SCOPE_DENIED", 404);
    const row = (await db.query("UPDATE evals.suite SET gate_threshold=$3 WHERE org_id=$1 AND id=$2 RETURNING id AS suite_id,gate_threshold::float8 AS gate_threshold", [scope.orgId, suiteId, threshold])).rows[0];
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'gate.threshold_saved',$3,$4)",
      [scope.orgId, scope.actorId, suiteId, { scope: "test_set", before: before.gate_threshold, after: threshold }]);
    return row;
  });
}
