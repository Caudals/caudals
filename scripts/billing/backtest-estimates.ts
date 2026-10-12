/**
 * Estimator backtest (launch spec v2 §6.7, P-16; package L-10 acceptance:
 * estimates within ±25 % of the actual cost on ≥ 80 % of historical runs).
 *
 * For every finished run (completed or partial) it rebuilds the estimate the
 * customer would have seen when the run started (the planned questions by
 * connection kind, the questions that need the judge, the frozen judge model,
 * and token statistics only from calls made before that moment, falling back
 * to the §6.7 seeds below 20 samples) and compares its p50 with what L-11
 * would have charged: the platform meter for each succeeded question, the
 * judge and report-writer tokens of completed calls at the revision-1 rates,
 * and executed web searches. Reads aggregates only; no content or workspace
 * identifiers leave the database.
 *
 *   # Production (read-only), through the database container:
 *   npx tsx scripts/billing/backtest-estimates.ts --sql | sudo docker exec -i <postgres> psql -U postgres -d caudals -X -q -At > backtest.json
 *   npx tsx scripts/billing/backtest-estimates.ts --input backtest.json [--json]
 *   # Or with a read-only connection: BILLING_DATABASE_URL(_FILE)=… npx tsx scripts/billing/backtest-estimates.ts
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";
import {
  callStatsFor, estimateRun, METER_FOR_KIND, SEEDED_THROUGHPUT, STATS_WINDOW_DAYS, type ConnectionKind, type EngineRole, type EstimateStats,
  type RoleModel, type StatsRow,
} from "../../lib/billing/estimate";
import { modelKey, modelProvider, REVISION_1_ACTIONS, REVISION_1_MODELS, type ActionMeter } from "../../lib/billing/price-book";
import { creditsToUcr, ucrToCredits, usageChargeUcr } from "../../lib/billing/units";

export const BACKTEST_SQL = `BEGIN READ ONLY;
WITH runs AS (
  SELECT r.id, r.org_id, r.created_at, r.status, r.execution_mode, tr.document->>'kind' AS target_kind,
    coalesce(rp.document->>'collection_policy', '') AS policy
  FROM evals.run r
  JOIN evals.target_revision tr ON tr.org_id = r.org_id AND tr.id = r.target_revision_id
  LEFT JOIN evals.run_plan rp ON rp.org_id = r.org_id AND rp.run_id = r.id
), units AS (
  SELECT u.org_id, u.run_id, count(*) AS planned, count(*) FILTER (WHERE u.status = 'succeeded') AS succeeded,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(cr.document->'reference'->'graders', '[]'::jsonb)) g
      WHERE g->>'kind' IN ('claims','llm_judge'))) AS judged_planned
  FROM evals.case_unit u JOIN evals.case_revision cr ON cr.org_id = u.org_id AND cr.id = u.case_revision_id
  GROUP BY u.org_id, u.run_id
), run_calls AS (
  SELECT j.org_id, j.run_id, 'judge' AS role, x.created_at, pv.adapter,
    CASE WHEN pv.adapter = 'dgx' THEN NULL ELSE split_part(split_part(pv.endpoint, '://', 2), '/', 1) END AS host, pv.model_id,
    (x.output->'usage'->>'input')::bigint AS inp, (x.output->'usage'->>'output')::bigint AS outp,
    coalesce(jsonb_array_length(x.output->'webSearch'->'queries'), 0) AS queries
  FROM evals.judge_job j
  JOIN evals.execution_result x ON x.org_id = j.org_id AND x.step_id = j.step_id
  JOIN evals.execution_attempt a ON a.org_id = x.org_id AND a.id = x.attempt_id
  JOIN evals.provider_revision pv ON pv.id = a.provider_revision_id
  WHERE jsonb_typeof(x.output->'usage') = 'object'
  UNION ALL
  SELECT n.org_id, rr.run_id, 'report_writer', x.created_at, pv.adapter,
    CASE WHEN pv.adapter = 'dgx' THEN NULL ELSE split_part(split_part(pv.endpoint, '://', 2), '/', 1) END, pv.model_id,
    (x.output->'usage'->>'input')::bigint, (x.output->'usage'->>'output')::bigint, 0
  FROM evals.report_narrative_job n
  JOIN evals.report_revision rr ON rr.org_id = n.org_id AND rr.id = n.report_revision_id
  JOIN evals.execution_result x ON x.org_id = n.org_id AND x.step_id = n.step_id
  JOIN evals.execution_attempt a ON a.org_id = x.org_id AND a.id = x.attempt_id
  JOIN evals.provider_revision pv ON pv.id = a.provider_revision_id
  WHERE jsonb_typeof(x.output->'usage') = 'object'
), history AS (
  SELECT s.input->>'role' AS role, x.created_at, pv.adapter,
    CASE WHEN pv.adapter = 'dgx' THEN NULL ELSE split_part(split_part(pv.endpoint, '://', 2), '/', 1) END AS host, pv.model_id,
    (x.output->'usage'->>'input')::bigint AS inp, (x.output->'usage'->>'output')::bigint AS outp,
    (a.token_bound - (s.input->>'maxOutputTokens')::integer) AS in_bound, (s.input->>'maxOutputTokens')::integer AS out_bound
  FROM evals.execution_result x
  JOIN evals.workflow_step s ON s.org_id = x.org_id AND s.id = x.step_id
  JOIN evals.execution_attempt a ON a.org_id = x.org_id AND a.id = x.attempt_id
  JOIN evals.provider_revision pv ON pv.id = a.provider_revision_id
  WHERE s.step_kind IN ('grade','generate','profile') AND s.input->>'role' IN ('judge','report_writer','generator','context_analyzer')
    AND coalesce((s.input->>'probe')::boolean, false) = false AND jsonb_typeof(x.output->'usage') = 'object'
), judge_route AS (
  SELECT r.org_id, r.id AS run_id, (SELECT pv.adapter FROM evals.provider_revision pv WHERE pv.id = (r.model_routes->'judge'->>'provider_revision_id')::uuid) AS adapter,
    (SELECT CASE WHEN pv.adapter = 'dgx' THEN NULL ELSE split_part(split_part(pv.endpoint, '://', 2), '/', 1) END FROM evals.provider_revision pv
      WHERE pv.id = (r.model_routes->'judge'->>'provider_revision_id')::uuid) AS host,
    r.model_routes->'judge'->>'model_id' AS model_id, coalesce((r.model_routes->'judge'->>'web_research')::boolean, false) AS web
  FROM evals.run r
)
SELECT json_build_object(
  'runs', coalesce((SELECT json_agg(json_build_object(
      'run', left(md5(r.id::text), 10), 'created_at', r.created_at, 'status', r.status, 'mode', r.execution_mode,
      'target_kind', r.target_kind, 'policy', r.policy, 'planned', coalesce(u.planned, 0), 'succeeded', coalesce(u.succeeded, 0),
      'judged_planned', coalesce(u.judged_planned, 0),
      'judge', json_build_object('adapter', jr.adapter, 'host', jr.host, 'model_id', jr.model_id, 'web', jr.web),
      'calls', coalesce((SELECT json_agg(json_build_object('role', c.role, 'adapter', c.adapter, 'host', c.host, 'model_id', c.model_id,
        'input', c.inp, 'output', c.outp, 'queries', c.queries)) FROM run_calls c WHERE c.org_id = r.org_id AND c.run_id = r.id), '[]'::json)
    ) ORDER BY r.created_at)
    FROM runs r LEFT JOIN units u ON u.org_id = r.org_id AND u.run_id = r.id
    LEFT JOIN judge_route jr ON jr.org_id = r.org_id AND jr.run_id = r.id), '[]'::json),
  'history', coalesce((SELECT json_agg(json_build_object('role', h.role, 'at', h.created_at, 'adapter', h.adapter, 'host', h.host, 'model_id', h.model_id,
    'input', h.inp, 'output', h.outp, 'in_bound', h.in_bound, 'out_bound', h.out_bound) ORDER BY h.created_at) FROM history h), '[]'::json)
);
ROLLBACK;`;

type Call = { role: EngineRole; adapter: string | null; host: string | null; model_id: string | null; input: number; output: number; queries: number };
type Run = {
  run: string; created_at: string; status: string; mode: string; target_kind: string; policy: string; planned: number; succeeded: number; judged_planned: number;
  judge: { adapter: string | null; host: string | null; model_id: string | null; web: boolean }; calls: Call[];
};
type History = { role: EngineRole; at: string; adapter: string; host: string | null; model_id: string; input: number; output: number; in_bound: number; out_bound: number };
export type BacktestData = { runs: Run[]; history: History[] };

const providerOf = (adapter: string | null, host: string | null) => modelProvider(adapter ?? "dgx", host ? `https://${host}/` : null);
const ACTION_UCR = Object.fromEntries(Object.entries(REVISION_1_ACTIONS).map(([meter, value]) => [meter, creditsToUcr(value)])) as Record<ActionMeter, bigint>;

/** Revision 1 rate tiers for a model (the DGX rate for any local model). */
function tiers(provider: string, modelId: string | null): RoleModel["tiers"] {
  const key = modelId ? modelKey(provider, modelId) : null;
  const exact = REVISION_1_MODELS.filter(model => model.provider === provider && model.modelId === key);
  const chosen = exact.length ? exact : REVISION_1_MODELS.filter(model => model.provider === provider && model.modelId === null);
  return chosen.map(model => ({ minInputTokens: model.minInputTokens, inputUcrPerM: creditsToUcr(model.credits.input), outputUcrPerM: creditsToUcr(model.credits.output), cachedUcrPerM: null, label: model.label }));
}

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * p, low = Math.floor(rank), high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
};
/** billing.estimate_stats, recomputed from the history strictly before an instant (60-day window). */
export function statsBefore(history: History[], before: Date): EstimateStats {
  const since = before.getTime() - STATS_WINDOW_DAYS * 86_400_000;
  const window = history.filter(call => { const at = Date.parse(call.at); return at >= since && at < before.getTime(); });
  const groups = new Map<string, History[]>();
  for (const call of window) {
    const provider = providerOf(call.adapter, call.host), model = modelKey(provider, call.model_id);
    for (const key of [`${call.role}|${provider}|${model}`, `${call.role}||`]) groups.set(key, [...(groups.get(key) ?? []), call]);
  }
  const rows: StatsRow[] = [];
  for (const [key, calls] of groups) {
    const [role, provider, model] = key.split("|");
    const col = (pick: (call: History) => number) => calls.map(pick).sort((a, b) => a - b);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = (values: number[]) => { if (values.length < 2) return 0; const m = mean(values); return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1)); };
    const inputs = col(call => call.input), outputs = col(call => call.output);
    rows.push({
      kind: "tokens", role, provider: provider || null, model_id: model || null, samples: calls.length,
      mean_input: mean(inputs), sd_input: sd(inputs), p50_input: percentile(inputs, 0.5), p90_input: percentile(inputs, 0.9),
      mean_output: mean(outputs), sd_output: sd(outputs), p50_output: percentile(outputs, 0.5), p90_output: percentile(outputs, 0.9),
      p90_input_bound: percentile(col(call => call.in_bound), 0.9), p90_output_bound: percentile(col(call => call.out_bound), 0.9), p50_seconds: null, p90_seconds: null,
    });
  }
  return { rows };
}

export interface RunResult { run: string; status: string; kind: ConnectionKind; planned: number; succeeded: number; estimateP50: bigint; estimateP90: bigint; actual: bigint; error: number; withinP90: boolean; statsSource: string }

export function backtest(data: BacktestData): { results: RunResult[]; excluded: Record<string, number> } {
  const excluded: Record<string, number> = {};
  const results: RunResult[] = [];
  for (const run of data.runs) {
    const reason = !["completed", "partial"].includes(run.status) ? `status_${run.status}`
      : run.policy === "person_collected_and_graded_case_revision_matched" ? "operator_graded_sheet"
      : run.planned === 0 ? "no_questions" : null;
    if (reason) { excluded[reason] = (excluded[reason] ?? 0) + 1; continue; }
    const kind: ConnectionKind = run.mode === "imported_responses" || run.target_kind === "imported_responses" ? "imported" : run.target_kind === "website" ? "website" : "api";
    const stats = statsBefore(data.history, new Date(run.created_at));
    const judgeProvider = providerOf(run.judge.adapter, run.judge.host);
    const judgeModel = run.judge.model_id ?? "unknown";
    const roles: Partial<Record<EngineRole, RoleModel>> = {
      judge: { modelId: judgeModel, free: false, webResearch: run.judge.web, tiers: tiers(judgeProvider, judgeModel), stats: callStatsFor(stats, "judge", judgeProvider, modelKey(judgeProvider, judgeModel)) },
      report_writer: { modelId: judgeModel, free: false, webResearch: false, tiers: tiers(judgeProvider, judgeModel), stats: callStatsFor(stats, "report_writer", judgeProvider, modelKey(judgeProvider, judgeModel)) },
    };
    const units = { website: 0, api: 0, imported: 0 } as Record<ConnectionKind, number>;
    units[kind] = run.planned;
    const estimate = estimateRun({
      units, judgedUnits: run.judged_planned, reportCalls: 1, generation: null, sources: { webPages: 0, documentPages: 0 }, roles, actionRates: ACTION_UCR,
      throughput: { website: { ...SEEDED_THROUGHPUT.website, source: "seeded" }, api: { ...SEEDED_THROUGHPUT.api, source: "seeded" } },
    });
    // What L-11 would have charged: succeeded questions, completed engine calls (rounded up per call), executed searches.
    let actual = ACTION_UCR[METER_FOR_KIND[kind]] * BigInt(run.succeeded);
    for (const call of run.calls) {
      const provider = providerOf(call.adapter, call.host);
      const tier = tiers(provider, call.model_id).filter(item => item.minInputTokens === 0 || call.input > item.minInputTokens).at(-1);
      if (tier) actual += usageChargeUcr({ input: call.input, output: call.output }, { inputUcrPerMillion: tier.inputUcrPerM, outputUcrPerMillion: tier.outputUcrPerM });
      actual += ACTION_UCR.web_search_query * BigInt(call.queries);
    }
    const error = actual === BigInt(0) ? (estimate.p50Ucr === BigInt(0) ? 0 : Infinity) : Number(estimate.p50Ucr - actual) / Number(actual);
    results.push({ run: run.run, status: run.status, kind, planned: run.planned, succeeded: run.succeeded, estimateP50: estimate.p50Ucr, estimateP90: estimate.p90Ucr, actual, error, withinP90: actual <= estimate.p90Ucr, statsSource: roles.judge!.stats.source });
  }
  return { results, excluded };
}

export function summary(results: RunResult[]) {
  const within = results.filter(result => Math.abs(result.error) <= 0.25).length;
  const by = (key: (result: RunResult) => string) => Object.fromEntries([...new Set(results.map(key))].map(value => {
    const group = results.filter(result => key(result) === value);
    return [value, { runs: group.length, within25: group.filter(result => Math.abs(result.error) <= 0.25).length }];
  }));
  return {
    runs: results.length, within25: within, share: results.length ? within / results.length : 0, target: 0.8,
    met: results.length > 0 && within / results.length >= 0.8,
    coveredByP90: results.filter(result => result.withinP90).length,
    medianAbsError: percentile(results.map(result => Math.abs(result.error)).sort((a, b) => a - b), 0.5),
    byKind: by(result => result.kind), byStatus: by(result => result.status), byStatsSource: by(result => result.statsSource),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--sql")) { console.log(BACKTEST_SQL); return; }
  let data: BacktestData;
  const inputIndex = args.indexOf("--input");
  if (inputIndex >= 0) data = JSON.parse(readFileSync(args[inputIndex + 1], "utf8"));
  else {
    const url = getSecretEnvValue("BILLING_DATABASE_URL");
    if (!url) throw new Error("database_url_required");
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const rows = (await pool.query(BACKTEST_SQL.replace(/^BEGIN READ ONLY;\n/, "").replace(/\nROLLBACK;$/, ""))).rows;
      data = rows[0].json_build_object;
    } finally { await pool.end(); }
  }
  const { results, excluded } = backtest(data);
  const report = summary(results);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ report, excluded, results: results.map(result => ({ ...result, estimateP50: ucrToCredits(result.estimateP50), estimateP90: ucrToCredits(result.estimateP90), actual: ucrToCredits(result.actual) })) }, null, 2));
    return;
  }
  const pct = (value: number) => `${(value * 100).toFixed(1)} %`;
  console.log(`Estimator backtest: ${report.within25}/${report.runs} runs within ±25 % (${pct(report.share)}; target ≥ 80 %: ${report.met ? "met" : "NOT met"}).`);
  console.log(`Actual cost at or below the p90 estimate: ${report.coveredByP90}/${report.runs}. Median absolute error: ${pct(report.medianAbsError ?? 0)}.`);
  console.log(`By connection: ${JSON.stringify(report.byKind)}; by status: ${JSON.stringify(report.byStatus)}; by token statistics: ${JSON.stringify(report.byStatsSource)}.`);
  console.log(`Excluded: ${JSON.stringify(excluded)}.`);
  console.log("\n| Run | Status | Kind | Questions (planned → succeeded) | Estimate p50 · p90 | Actual | Error |\n| --- | --- | --- | --- | --- | --- | --- |");
  for (const result of results) {
    console.log(`| ${result.run} | ${result.status} | ${result.kind} | ${result.planned} → ${result.succeeded} | ${ucrToCredits(result.estimateP50)} · ${ucrToCredits(result.estimateP90)} | ${ucrToCredits(result.actual)} | ${Number.isFinite(result.error) ? pct(result.error) : "—"} |`);
  }
}

if (process.argv[1]?.endsWith("backtest-estimates.ts")) {
  main().catch(error => {
    console.error(`Backtest failed: ${error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : "unexpected error"}`);
    process.exitCode = 1;
  });
}
