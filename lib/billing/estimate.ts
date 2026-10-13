/**
 * Run cost estimate (launch spec v2 §6.7, P-16 backend; package L-10).
 *
 * Inputs: the frozen test set (questions by connection kind, repetitions,
 * which questions need the answer judge), the model per engine role, whether
 * a new test set must be generated, sources still to read, and web research.
 *
 * Engine tokens per role come from the last 60 days of execution_result
 * usage (platform-wide aggregates from billing.estimate_stats): per role and
 * model when there are 20 samples, otherwise per role, otherwise the §6.7
 * seeded Sept–Oct averages. A run's total is a sum of many calls, so its
 * median is n × mean per call and its p90 adds 1.2816 standard deviations of
 * that sum (√n × sd). Platform meters (§6.3) are counted exactly.
 *
 * Output: p50 and p90 credits with their euro equivalent, the largest single
 * hold an engine call would place, and a time range from the observed
 * seconds per question of completed runs for the connection kind.
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import { formatEuroEquivalent, ucrToCredits, usageChargeUcr, wholeCreditsUp } from "./units";
import { getPriceBookAt, type ActionMeter, type ModelRate } from "./price-book";
import { getCreditAccount } from "./ledger";

export const ENGINE_ROLES = ["context_analyzer", "generator", "judge", "report_writer"] as const;
export type EngineRole = typeof ENGINE_ROLES[number];
export type ConnectionKind = "website" | "api" | "imported";
export const CONNECTION_KINDS: readonly ConnectionKind[] = ["website", "api", "imported"];
/** The §6.3 meter charged per question (or imported answer) for each connection kind. */
export const METER_FOR_KIND: Readonly<Record<ConnectionKind, ActionMeter>> = { website: "website_question", api: "api_question", imported: "graded_answer" };

export const STATS_WINDOW_DAYS = 60;
/** §6.7: measured token statistics replace the seeded ones from 20 samples. */
export const MIN_SAMPLES = 20;
/** Completed runs needed before a connection kind's measured throughput is used. */
export const MIN_THROUGHPUT_RUNS = 3;
/** One-sided 90 % normal quantile. */
const Z90 = 1.2816;
/** Generation: about one generator call per 12 questions, plus one for revision rounds, and one context analysis. */
export const QUESTIONS_PER_GENERATOR_CALL = 12;

export interface CallStats {
  samples: number;
  meanInput: number; meanOutput: number; sdInput: number; sdOutput: number;
  p50Input: number; p90Input: number; p50Output: number; p90Output: number;
  /** p90 of the token bound a call reserves (prompt bytes + 1024, and its output cap): the hold basis. */
  inputBound: number; outputBound: number;
  p50Seconds: number; p90Seconds: number;
  source: "model" | "role" | "seeded";
}
type SeedStats = Omit<CallStats, "samples" | "source">;
/**
 * §6.7 seeded fallbacks: the measured Sept–Oct means per call (judge ≈ 2.2k +
 * 0.33k, generator ≈ 28k + 2.5k, context analyzer ≈ 22k + 4k). Spread, bounds,
 * latency and the report writer were measured on production on 2026-10-12.
 */
export const SEEDED_CALL_STATS: Readonly<Record<EngineRole, SeedStats>> = {
  judge: { meanInput: 2200, meanOutput: 330, sdInput: 970, sdOutput: 180, p50Input: 1830, p90Input: 3860, p50Output: 340, p90Output: 530, inputBound: 18_100, outputBound: 1536, p50Seconds: 18, p90Seconds: 38 },
  generator: { meanInput: 28_000, meanOutput: 2500, sdInput: 8600, sdOutput: 2400, p50Input: 30_400, p90Input: 34_900, p50Output: 2100, p90Output: 3800, inputBound: 122_000, outputBound: 16_384, p50Seconds: 125, p90Seconds: 290 },
  context_analyzer: { meanInput: 22_000, meanOutput: 4000, sdInput: 12_500, sdOutput: 2400, p50Input: 28_000, p90Input: 36_200, p50Output: 4400, p90Output: 7600, inputBound: 126_200, outputBound: 16_384, p50Seconds: 94, p90Seconds: 540 },
  report_writer: { meanInput: 700, meanOutput: 370, sdInput: 450, sdOutput: 320, p50Input: 470, p90Input: 1300, p50Output: 190, p90Output: 760, inputBound: 7200, outputBound: 1024, p50Seconds: 14, p90Seconds: 27 },
};
/** Seconds per question of a completed run, judging included, until three runs are measured (production, 2026-10-12). */
export const SEEDED_THROUGHPUT: Readonly<Record<Exclude<ConnectionKind, "imported">, { p50: number; p90: number }>> = {
  website: { p50: 52, p90: 76 },
  api: { p50: 10, p90: 30 },
};

export interface RoleModel {
  modelId: string;
  /** The price-book rate tiers that apply to the model (lowest tier first); empty when unpriced. */
  tiers: Array<Pick<ModelRate, "minInputTokens" | "inputUcrPerM" | "outputUcrPerM" | "cachedUcrPerM" | "label">>;
  /** Explicit free models carry no token charge (§6.4). */
  free: boolean;
  webResearch: boolean;
  stats: CallStats;
}

export interface EstimateInput {
  /** Question executions (questions × repetitions) by connection kind. */
  units: Readonly<Record<ConnectionKind, number>>;
  /** Units whose questions need the answer judge (semantic criteria). */
  judgedUnits: number;
  /** Report narrative calls (one per run). */
  reportCalls: number;
  /** A new test set to generate before the run, if any. */
  generation: { questions: number } | null;
  sources: { webPages: number; documentPages: number };
  roles: Partial<Record<EngineRole, RoleModel>>;
  actionRates: Readonly<Record<ActionMeter, bigint>>;
  throughput: Readonly<Record<Exclude<ConnectionKind, "imported">, { p50: number; p90: number; source: "measured" | "seeded" }>>;
}

export interface EstimateLine { kind: "meter" | "tokens"; key: string; quantity: number; p50Ucr: bigint; p90Ucr: bigint }
export interface RunEstimate {
  p50Ucr: bigint; p90Ucr: bigint; largestHoldUcr: bigint;
  etaSeconds: { p50: number; p90: number };
  lines: EstimateLine[];
  /** Roles in use whose model has no credit rate and is not free (the €0 guard should prevent this). */
  unpriced: EngineRole[];
}

function count(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error("invalid_count");
  return value;
}

/** Engine calls per role for a run (and its generation, when requested). */
export function engineCalls(input: Pick<EstimateInput, "judgedUnits" | "reportCalls" | "generation">): Record<EngineRole, number> {
  const generated = input.generation ? count(input.generation.questions) : 0;
  return {
    judge: count(input.judgedUnits),
    report_writer: count(input.reportCalls),
    generator: generated ? Math.ceil(generated / QUESTIONS_PER_GENERATOR_CALL) + 1 : 0,
    context_analyzer: generated ? 1 : 0,
  };
}

/** Run-total tokens for n independent calls: median ≈ n × mean; p90 adds 1.2816 × sd × √n (never below n × the per-call median). */
export function runTokens(stats: CallStats, calls: number): { p50: { input: number; output: number }; p90: { input: number; output: number } } {
  if (calls <= 0) return { p50: { input: 0, output: 0 }, p90: { input: 0, output: 0 } };
  const p50 = (mean: number) => Math.ceil(calls * mean);
  const p90 = (mean: number, sd: number, median: number) => Math.ceil(Math.max(calls * mean + Z90 * sd * Math.sqrt(calls), calls * median));
  return {
    p50: { input: p50(stats.meanInput), output: p50(stats.meanOutput) },
    p90: { input: p90(stats.meanInput, stats.sdInput, stats.p50Input), output: p90(stats.meanOutput, stats.sdOutput, stats.p50Output) },
  };
}

/** The tier for a call of this many input tokens: the highest threshold it exceeds. */
export function tierFor<T extends { minInputTokens: number }>(tiers: readonly T[], inputTokens: number): T | null {
  let best: T | null = null;
  for (const tier of tiers) if ((tier.minInputTokens === 0 || inputTokens > tier.minInputTokens) && (!best || tier.minInputTokens >= best.minInputTokens)) best = tier;
  return best;
}

function tokenCharge(model: RoleModel, perCallInput: number, totals: { input: number; output: number }): bigint {
  if (model.free) return BigInt(0);
  const tier = tierFor(model.tiers, perCallInput);
  if (!tier) return BigInt(0);
  return usageChargeUcr({ input: totals.input, output: totals.output }, { inputUcrPerMillion: tier.inputUcrPerM, outputUcrPerMillion: tier.outputUcrPerM });
}

/** The estimate itself: pure, exact µcr. */
export function estimateRun(input: EstimateInput): RunEstimate {
  const lines: EstimateLine[] = [];
  const meter = (key: ActionMeter, quantity: number, multiplier = 1) => {
    if (quantity <= 0) return;
    const ucr = input.actionRates[key] * BigInt(quantity * multiplier);
    lines.push({ kind: "meter", key, quantity: quantity * multiplier, p50Ucr: ucr, p90Ucr: ucr });
  };
  for (const kind of CONNECTION_KINDS) meter(METER_FOR_KIND[kind], count(input.units[kind]));
  meter("web_page_read", count(input.sources.webPages));
  // Document pages are 0.5 credits: the rate is stored in µcr, so the product stays exact.
  meter("document_page", count(input.sources.documentPages));
  const calls = engineCalls(input);
  const webQueries = (input.roles.judge?.webResearch ? calls.judge : 0) + (input.roles.generator?.webResearch ? calls.generator : 0);
  meter("web_search_query", webQueries);

  const unpriced: EngineRole[] = [];
  let largestHold = BigInt(0);
  for (const role of ENGINE_ROLES) {
    const n = calls[role];
    const model = input.roles[role];
    if (!n || !model) continue;
    if (!model.free && !model.tiers.length) unpriced.push(role);
    const tokens = runTokens(model.stats, n);
    const p50Ucr = tokenCharge(model, model.stats.meanInput, tokens.p50);
    const p90Ucr = tokenCharge(model, model.stats.p90Input, tokens.p90);
    lines.push({ kind: "tokens", key: role, quantity: n, p50Ucr, p90Ucr: p90Ucr < p50Ucr ? p50Ucr : p90Ucr });
    // Measured bounds are percentiles: round up to whole tokens.
    const bound = { input: Math.ceil(model.stats.inputBound), output: Math.ceil(model.stats.outputBound) };
    const hold = tokenCharge(model, bound.input, bound);
    if (hold > largestHold) largestHold = hold;
  }

  const units = input.units;
  const judge = input.roles.judge?.stats ?? null;
  const eta = (which: "p50" | "p90") => {
    let seconds = units.website * input.throughput.website[which] + units.api * input.throughput.api[which];
    // Imported answers only need grading.
    if (units.imported && judge) seconds += Math.min(units.imported, calls.judge) * (which === "p50" ? judge.p50Seconds : judge.p90Seconds);
    const generator = input.roles.generator?.stats, context = input.roles.context_analyzer?.stats, writer = input.roles.report_writer?.stats;
    if (generator) seconds += calls.generator * (which === "p50" ? generator.p50Seconds : generator.p90Seconds);
    if (context) seconds += calls.context_analyzer * (which === "p50" ? context.p50Seconds : context.p90Seconds);
    if (writer) seconds += calls.report_writer * (which === "p50" ? writer.p50Seconds : writer.p90Seconds);
    return Math.ceil(seconds);
  };

  const sum = (key: "p50Ucr" | "p90Ucr") => lines.reduce((total, line) => total + line[key], BigInt(0));
  return { p50Ucr: sum("p50Ucr"), p90Ucr: sum("p90Ucr"), largestHoldUcr: largestHold, etaSeconds: { p50: eta("p50"), p90: Math.max(eta("p50"), eta("p90")) }, lines, unpriced };
}

/* ---------------------------------------------------------- statistics --- */

export interface StatsRow {
  kind: "tokens" | "throughput"; role: string | null; provider: string | null; model_id: string | null; samples: number;
  mean_input: number | null; sd_input: number | null; p50_input: number | null; p90_input: number | null;
  mean_output: number | null; sd_output: number | null; p50_output: number | null; p90_output: number | null;
  p90_input_bound: number | null; p90_output_bound: number | null; p50_seconds: number | null; p90_seconds: number | null;
}
export interface EstimateStats { rows: StatsRow[] }

/** Platform-wide aggregates for [until − 60 days, until). */
export async function loadEstimateStats(db: PoolClient, until: Date = new Date(), days = STATS_WINDOW_DAYS): Promise<EstimateStats> {
  const since = new Date(until.getTime() - days * 86_400_000);
  const rows = (await db.query("SELECT * FROM billing.estimate_stats($1::timestamptz,$2::timestamptz)", [since, until])).rows as StatsRow[];
  return { rows: rows.map(row => ({ ...row, samples: Number(row.samples) })) };
}

function fromRow(row: StatsRow, seed: SeedStats, source: CallStats["source"]): CallStats {
  const pick = (value: number | null, fallback: number) => (value === null || !Number.isFinite(Number(value)) ? fallback : Number(value));
  return {
    samples: row.samples, source,
    meanInput: pick(row.mean_input, seed.meanInput), meanOutput: pick(row.mean_output, seed.meanOutput),
    sdInput: pick(row.sd_input, seed.sdInput), sdOutput: pick(row.sd_output, seed.sdOutput),
    p50Input: pick(row.p50_input, seed.p50Input), p90Input: pick(row.p90_input, seed.p90Input),
    p50Output: pick(row.p50_output, seed.p50Output), p90Output: pick(row.p90_output, seed.p90Output),
    inputBound: pick(row.p90_input_bound, seed.inputBound), outputBound: pick(row.p90_output_bound, seed.outputBound),
    p50Seconds: pick(row.p50_seconds, seed.p50Seconds), p90Seconds: pick(row.p90_seconds, seed.p90Seconds),
  };
}

/** Per role and model with 20 samples, else per role with 20, else the §6.7 seed. */
export function callStatsFor(stats: EstimateStats, role: EngineRole, provider: string, modelId: string): CallStats {
  const seed = SEEDED_CALL_STATS[role];
  const exact = stats.rows.find(row => row.kind === "tokens" && row.role === role && row.provider === provider && row.model_id === modelId);
  if (exact && exact.samples >= MIN_SAMPLES) return fromRow(exact, seed, "model");
  const any = stats.rows.find(row => row.kind === "tokens" && row.role === role && row.provider === null && row.model_id === null);
  if (any && any.samples >= MIN_SAMPLES) return fromRow(any, seed, "role");
  return { ...seed, samples: exact?.samples ?? any?.samples ?? 0, source: "seeded" };
}

/** Below this many measured runs the tail is capped: one run left open for a day (a later re-grade, a paused judge) would otherwise set it. */
export const ROBUST_TAIL_RUNS = 20;
export function throughputFor(stats: EstimateStats): EstimateInput["throughput"] {
  const result = {} as Record<"website" | "api", { p50: number; p90: number; source: "measured" | "seeded" }>;
  for (const kind of ["website", "api"] as const) {
    const row = stats.rows.find(item => item.kind === "throughput" && item.role === kind);
    if (!row || row.samples < MIN_THROUGHPUT_RUNS || row.p50_seconds === null || row.p90_seconds === null) {
      result[kind] = { ...SEEDED_THROUGHPUT[kind], source: "seeded" };
      continue;
    }
    const p50 = Number(row.p50_seconds), p90 = Math.max(p50, Number(row.p90_seconds));
    result[kind] = { p50, p90: row.samples < ROBUST_TAIL_RUNS ? Math.min(p90, 2 * p50) : p90, source: "measured" };
  }
  return result;
}

/* ------------------------------------------------------- run planning --- */

/** The connection kind a target revision is metered as. */
export function connectionKindOf(targetKind: string | null | undefined, executionMode?: string | null): ConnectionKind {
  if (executionMode === "imported_responses" || targetKind === "imported_responses") return "imported";
  return targetKind === "website" ? "website" : "api";
}

/** Whether a case's answers go to the answer judge (grader v2: claims or llm_judge criteria). */
export function caseNeedsJudge(document: { reference?: { graders?: Array<{ kind?: string }> } } | null | undefined): boolean {
  return !!document?.reference?.graders?.some(grader => grader.kind === "claims" || grader.kind === "llm_judge");
}

export function caseRepetitions(document: { limits?: { repetitions?: unknown } } | null | undefined): number {
  const value = Number(document?.limits?.repetitions ?? 1);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 100) : 1;
}

/* --------------------------------------------------------------- API --- */

export const estimateRequestSchema = z.strictObject({
  evaluationId: z.uuid(),
  /** Default: the evaluation's approved test set. */
  suiteVersionId: z.uuid().optional(),
  /** Default: the evaluation's selected system. */
  targetRevisionId: z.uuid().optional(),
  /** Price a different model for a role (a registered provider revision). */
  models: z.partialRecord(z.enum(ENGINE_ROLES), z.uuid()).optional(),
  /** Generate a new test set of this many questions first. */
  generation: z.strictObject({ questions: z.number().int().min(1).max(500) }).optional(),
  /** Reference material still to read. */
  sources: z.strictObject({ webPages: z.number().int().min(0).max(10_000).default(0), documentPages: z.number().int().min(0).max(100_000).default(0) }).optional(),
});
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

export class EstimateError extends Error {
  constructor(readonly code: "SCOPE_DENIED" | "INPUT_INVALID" | "PRICE_BOOK_MISSING", readonly detail: string) { super(detail); this.name = "EstimateError"; }
}

type RouteRow = { role: EngineRole; provider_revision_id: string; model_id: string; provider: string; model_key: string; free_model: boolean; web_research: boolean };

async function modelRoutes(db: PoolClient, orgId: string, evaluationId: string, overrides: EstimateRequest["models"]): Promise<Map<EngineRole, RouteRow>> {
  // Same precedence as lib/evals/repositories/model-routes.ts: evaluation, workspace, platform.
  const rows = (await db.query(`WITH chosen AS (
      SELECT r.role, r.provider_revision_id, r.web_research, 1 AS rank FROM evals.evaluation_model_route r WHERE r.org_id=$1 AND r.evaluation_id=$2
      UNION ALL SELECT r.role, r.provider_revision_id, r.web_research, 2 FROM evals.generation_provider_route r WHERE r.org_id=$1
      UNION ALL SELECT r.role, r.provider_revision_id, r.web_research, 3 FROM evals.platform_model_route r
    )
    SELECT DISTINCT ON (c.role) c.role, c.provider_revision_id, p.model_id, k.free_model, c.web_research, k.provider, k.model_key
    FROM chosen c JOIN evals.provider_revision p ON p.id=c.provider_revision_id
    CROSS JOIN LATERAL billing.provider_revision_rate_key(p.id) k
    JOIN evals.provider_account a ON a.id=p.account_id
    WHERE c.role = ANY($3::text[]) AND (c.rank = 1 OR (a.enabled AND (p.retired_at IS NULL OR p.retired_at > now())))
    ORDER BY c.role, c.rank`, [orgId, evaluationId, [...ENGINE_ROLES]])).rows as RouteRow[];
  const routes = new Map(rows.map(row => [row.role, row]));
  for (const [role, providerRevisionId] of Object.entries(overrides ?? {}) as Array<[EngineRole, string]>) {
    const row = (await db.query(`SELECT p.id AS provider_revision_id, p.model_id, k.free_model, k.provider, k.model_key
      FROM evals.provider_revision p CROSS JOIN LATERAL billing.provider_revision_rate_key(p.id) k
      JOIN evals.provider_account a ON a.id=p.account_id
      WHERE p.id=$1 AND a.enabled AND (p.retired_at IS NULL OR p.retired_at > now()) AND $2 = ANY(k.roles)`, [providerRevisionId, role])).rows[0];
    if (!row) throw new EstimateError("INPUT_INVALID", `That model is not available for ${role.replace("_", " ")}.`);
    routes.set(role, { ...row, role, web_research: routes.get(role)?.web_research ?? false });
  }
  return routes;
}

function tiersFor(models: ModelRate[], provider: string, modelKey: string): RoleModel["tiers"] {
  const exact = models.filter(rate => rate.provider === provider && rate.modelId === modelKey);
  const chosen = exact.length ? exact : models.filter(rate => rate.provider === provider && rate.modelId === null);
  return chosen.sort((a, b) => a.minInputTokens - b.minInputTokens)
    .map(rate => ({ minInputTokens: rate.minInputTokens, inputUcrPerM: rate.inputUcrPerM, outputUcrPerM: rate.outputUcrPerM, cachedUcrPerM: rate.cachedUcrPerM, label: rate.label }));
}

/**
 * The estimate for one evaluation's next run, inside the caller's tenant
 * transaction (RLS scopes every read to the workspace). Returns a JSON-safe
 * view: µcr as strings, whole credits rounded up, euros, balance and ETA.
 */
export async function estimateEvaluationRun(db: PoolClient, orgId: string, raw: unknown, now: Date = new Date()) {
  const input = estimateRequestSchema.parse(raw);
  const evaluation = (await db.query("SELECT id,selected_suite_version_id,selected_target_revision_id FROM evals.evaluation WHERE org_id=$1 AND id=$2 AND archived_at IS NULL", [orgId, input.evaluationId])).rows[0];
  if (!evaluation) throw new EstimateError("SCOPE_DENIED", "Evaluation not found.");
  const targetRevisionId = input.targetRevisionId ?? evaluation.selected_target_revision_id;
  const target = targetRevisionId ? (await db.query("SELECT document->>'kind' AS kind FROM evals.target_revision WHERE org_id=$1 AND id=$2", [orgId, targetRevisionId])).rows[0] : null;
  if (!target) throw new EstimateError("INPUT_INVALID", "Choose the system to test first.");
  const kind = connectionKindOf(target.kind);
  const suiteVersionId = input.suiteVersionId ?? evaluation.selected_suite_version_id;
  const units: Record<ConnectionKind, number> = { website: 0, api: 0, imported: 0 };
  let judgedUnits = 0, questions = 0;
  if (input.generation) {
    // A new test set: one execution per generated question; v2 grading judges every answer.
    questions = input.generation.questions;
    units[kind] = questions;
    judgedUnits = questions;
  } else {
    if (!suiteVersionId) throw new EstimateError("INPUT_INVALID", "The evaluation has no approved test set yet.");
    const cases = (await db.query(`SELECT cr.document->'limits' AS limits, cr.document->'reference'->'graders' AS graders
      FROM evals.suite_case sc JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
      WHERE sc.org_id=$1 AND sc.suite_version_id=$2`, [orgId, suiteVersionId])).rows as Array<{ limits: { repetitions?: unknown } | null; graders: Array<{ kind?: string }> | null }>;
    if (!cases.length) throw new EstimateError("INPUT_INVALID", "The test set is empty.");
    for (const item of cases) {
      const repetitions = caseRepetitions({ limits: item.limits ?? undefined });
      units[kind] += repetitions;
      if (caseNeedsJudge({ reference: { graders: item.graders ?? [] } })) judgedUnits += repetitions;
      questions += 1;
    }
  }
  const book = await getPriceBookAt(db, now);
  if (!book) throw new EstimateError("PRICE_BOOK_MISSING", "No price book is in effect.");
  const actionRates = Object.fromEntries(book.actions.map(action => [action.meter, action.ucrPerUnit])) as Record<ActionMeter, bigint>;
  const stats = await loadEstimateStats(db, now);
  const routes = await modelRoutes(db, orgId, input.evaluationId, input.models);
  const roles: Partial<Record<EngineRole, RoleModel>> = {};
  for (const [role, route] of routes) {
    roles[role] = {
      modelId: route.model_id, free: route.free_model, webResearch: route.web_research,
      tiers: tiersFor(book.models, route.provider, route.model_key),
      stats: callStatsFor(stats, role, route.provider, route.model_key),
    };
  }
  const estimateInput: EstimateInput = {
    units, judgedUnits, reportCalls: 1, generation: input.generation ?? null,
    sources: { webPages: input.sources?.webPages ?? 0, documentPages: input.sources?.documentPages ?? 0 },
    roles, actionRates, throughput: throughputFor(stats),
  };
  const result = estimateRun(estimateInput);
  const account = await getCreditAccount(db, orgId);
  const p90Credits = wholeCreditsUp(result.p90Ucr);
  const available = account ? account.availableUcr : null;
  const shortfall = available === null ? null : result.p90Ucr > available ? result.p90Ucr - available : BigInt(0);
  return {
    evaluationId: input.evaluationId,
    suiteVersionId: input.generation ? null : suiteVersionId,
    targetRevisionId,
    connection: kind,
    priceBook: { id: book.revision.id, revision: book.revision.revision },
    questions: { count: questions, executions: units[kind], judged: judgedUnits, generated: input.generation?.questions ?? 0 },
    credits: { p50: wholeCreditsUp(result.p50Ucr).toString(), p90: p90Credits.toString() },
    euros: { p50: formatEuroEquivalent(result.p50Ucr), p90: formatEuroEquivalent(result.p90Ucr) },
    ucr: { p50: result.p50Ucr.toString(), p90: result.p90Ucr.toString() },
    largestHold: { ucr: result.largestHoldUcr.toString(), credits: wholeCreditsUp(result.largestHoldUcr).toString() },
    eta: { p50Seconds: result.etaSeconds.p50, p90Seconds: result.etaSeconds.p90, basis: estimateInput.throughput[kind === "imported" ? "api" : kind].source },
    // Contract workspaces run on their contract budget, without credit holds (§6.8 step 7).
    balance: account ? {
      billingMode: account.billingMode,
      requiresCredits: account.billingMode !== "contract",
      availableCredits: ucrToCredits(account.availableUcr),
      coversP90: account.billingMode === "contract" || shortfall === BigInt(0),
      addCredits: account.billingMode === "contract" || shortfall === null ? null : wholeCreditsUp(shortfall).toString(),
    } : null,
    models: Object.fromEntries(Object.entries(roles).map(([role, model]) => [role, {
      modelId: model!.modelId, free: model!.free, priced: model!.free || model!.tiers.length > 0, rate: model!.tiers[0]?.label ?? null,
      // Credits per 1M input and output tokens at the lowest prompt-size tier (L-15: rates beside each model).
      credits: model!.tiers[0] ? { input: ucrToCredits(model!.tiers[0].inputUcrPerM), output: ucrToCredits(model!.tiers[0].outputUcrPerM) } : null,
      webResearch: model!.webResearch, statsSource: model!.stats.source, samples: model!.stats.samples,
    }])),
    lines: result.lines.map(line => ({ ...line, p50Ucr: line.p50Ucr.toString(), p90Ucr: line.p90Ucr.toString() })),
    unpriced: result.unpriced,
    estimatedAt: now.toISOString(),
  };
}

/**
 * The models an evaluation's next run would use, per engine role, with their
 * credit rates in the revision in effect, plus the priced catalog and the
 * platform meters (launch L-15: credit rates beside the model picker). The
 * price list is the spec's public §6.4 table; nothing here is per customer.
 */
export async function evaluationModelRates(db: PoolClient, orgId: string, evaluationId: string | null, now: Date = new Date()) {
  const book = await getPriceBookAt(db, now);
  if (!book) throw new EstimateError("PRICE_BOOK_MISSING", "No price book is in effect.");
  const credits = (ucr: bigint) => ucrToCredits(ucr);
  let roles: Array<{ role: EngineRole; modelId: string; label: string | null; free: boolean; input: string | null; output: string | null }> = [];
  if (evaluationId) {
    const evaluation = (await db.query("SELECT id FROM evals.evaluation WHERE org_id=$1 AND id=$2 AND archived_at IS NULL", [orgId, evaluationId])).rows[0];
    if (!evaluation) throw new EstimateError("SCOPE_DENIED", "Evaluation not found.");
    const routes = await modelRoutes(db, orgId, evaluationId, undefined);
    roles = ENGINE_ROLES.filter(role => routes.has(role)).map(role => {
      const route = routes.get(role)!;
      const tier = tiersFor(book.models, route.provider, route.model_key)[0];
      return { role, modelId: route.model_id, label: tier?.label ?? null, free: route.free_model, input: tier ? credits(tier.inputUcrPerM) : null, output: tier ? credits(tier.outputUcrPerM) : null };
    });
  }
  return {
    priceBook: { id: book.revision.id, revision: book.revision.revision, effectiveAt: book.revision.effectiveAt?.toISOString() ?? null },
    roles,
    catalog: book.models.map(rate => ({ label: rate.label, provider: rate.provider, minInputTokens: rate.minInputTokens, input: credits(rate.inputUcrPerM), output: credits(rate.outputUcrPerM) })),
    meters: book.actions.map(action => ({ meter: action.meter, unit: action.unit, credits: credits(action.ucrPerUnit) })),
  };
}