/**
 * The credit price book (launch spec v2 §6.3, §6.4, §6.13, §6.16; migration
 * 088). Revisions move draft -> scheduled -> active -> retired; the one in
 * effect at an instant is the latest non-draft revision whose effective_at is
 * at or before it (billing.price_book_at), so a scheduled revision applies
 * exactly on time and every run can freeze the revision it started under.
 *
 * Credit rate (D-03) = provider list price (USD per 1M tokens) / FX (USD per
 * EUR) × (1 + routing fee) × multiplier × 100, rounded up to the next 5
 * credits per 1M tokens, minimum 10. All arithmetic is exact (BigInt
 * rationals); the database stores the result and enforces the grid.
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import { UCR_PER_CREDIT, creditsToUcr, ucrToCredits } from "./units";

export const ACTION_METERS = ["website_question", "api_question", "graded_answer", "web_page_read", "document_page", "web_search_query"] as const;
export type ActionMeter = typeof ACTION_METERS[number];
export const METER_UNITS: Readonly<Record<ActionMeter, "question" | "answer" | "page" | "query">> = {
  website_question: "question", api_question: "question", graded_answer: "answer",
  web_page_read: "page", document_page: "page", web_search_query: "query",
};

export type RevisionStatus = "draft" | "scheduled" | "active" | "retired";
export interface PriceBookRevision {
  id: string; revision: number; status: RevisionStatus; title: string; notes: string | null; effectiveAt: Date | null;
  multiplier: string; fxUsdPerEur: string; fxDate: string; fxSource: string; basedOnId: string | null;
  raisesPrices: boolean | null; noticeSentAt: Date | null; createdBy: string; createdAt: Date;
  scheduledAt: Date | null; activatedAt: Date | null; retiredAt: Date | null;
}
export interface ModelRate {
  id: string; label: string; provider: string; modelId: string | null; minInputTokens: number;
  inputUcrPerM: bigint; outputUcrPerM: bigint; cachedUcrPerM: bigint | null;
  costBasis: "list_price" | "internal_estimate";
  usdInputPerM: string | null; usdOutputPerM: string | null; usdCachedPerM: string | null;
  eurInputPerM: string; eurOutputPerM: string; routingFeeBps: number; source: string; sourceAccessedOn: string | null;
}
export interface ActionRate { meter: ActionMeter; unit: string; ucrPerUnit: bigint; label: string }

const ZERO = BigInt(0), ONE = BigInt(1), FIVE = BigInt(5), TEN = BigInt(10), HUNDRED = BigInt(100), BPS = BigInt(10_000);
const MICRO = BigInt(1_000_000);
/** §6.4: rates sit on a 5-credit grid with a 10-credit floor. */
export const RATE_STEP_CREDITS = FIVE;
export const RATE_MIN_CREDITS = TEN;
/** D-03. */
export const DEFAULT_MULTIPLIER = "1.5";
/** OpenRouter's fee on credit purchases (§6.4, secondary sources). */
export const OPENROUTER_FEE_BPS = 550;

/** A non-negative decimal with up to six places as an integer of millionths. */
export function decimalMicros(value: string | number): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new Error("invalid_decimal");
  return BigInt(match[1]) * MICRO + BigInt((match[2] ?? "").padEnd(6, "0"));
}
function microsText(value: bigint, places = 6): string {
  const whole = value / MICRO, fraction = (value % MICRO).toString().padStart(6, "0").slice(0, places);
  return `${whole}.${fraction}`;
}

export interface CostInput { usdPerMillion: string; fxUsdPerEur: string; routingFeeBps: number; multiplier?: string }

function costRatio(input: CostInput): { num: bigint; den: bigint } {
  if (!Number.isInteger(input.routingFeeBps) || input.routingFeeBps < 0 || input.routingFeeBps > 5000) throw new Error("invalid_fee");
  const usd = decimalMicros(input.usdPerMillion), fx = decimalMicros(input.fxUsdPerEur);
  if (fx <= ZERO) throw new Error("invalid_fx");
  // EUR per 1M = usd / fx × (10000 + bps) / 10000, both decimals in millionths.
  return { num: usd * (BPS + BigInt(input.routingFeeBps)), den: fx * BPS };
}

/** Our cost in EUR per 1M tokens, rounded half-up to six decimals (as stored). */
export function eurCostPerMillion(input: CostInput): string {
  const { num, den } = costRatio(input);
  return microsText((num * MICRO * BigInt(2) + den) / (den * BigInt(2)));
}

/** Rounds an exact credit amount (num/den credits) up to the grid. */
export function roundCreditRate(num: bigint, den: bigint): bigint {
  if (num < ZERO || den <= ZERO) throw new Error("invalid_rate");
  const step = den * RATE_STEP_CREDITS;
  const steps = (num + step - ONE) / step;
  const credits = steps * RATE_STEP_CREDITS;
  return credits < RATE_MIN_CREDITS ? RATE_MIN_CREDITS : credits;
}

/** µcr per 1M tokens for a list price: cost × multiplier × 100, rounded up to 5 credits, minimum 10. */
export function creditRateUcrPerMillion(input: CostInput): bigint {
  const { num, den } = costRatio(input);
  const multiplier = decimalMicros(input.multiplier ?? DEFAULT_MULTIPLIER);
  if (multiplier < MICRO) throw new Error("invalid_multiplier");
  return roundCreditRate(num * multiplier * HUNDRED, den * MICRO) * UCR_PER_CREDIT;
}

/** A rate given directly in credits (capacity-priced models) must sit on the same grid. */
export function gridRateUcr(credits: string | number): bigint {
  const ucr = creditsToUcr(credits);
  const step = RATE_STEP_CREDITS * UCR_PER_CREDIT;
  if (ucr < RATE_MIN_CREDITS * UCR_PER_CREDIT || ucr % step !== ZERO) throw new Error("rate_off_grid");
  return ucr;
}

/** Gross margin of a rate at list price: 1 − cost / price (cost in EUR per 1M, price in µcr per 1M). */
export function tokenMargin(eurCostPerM: string, ucrPerM: bigint): number {
  const priceEurMicros = ucrPerM / HUNDRED; // 1 credit = €0.01 → µcr/100 = µ€
  if (priceEurMicros === ZERO) return 0;
  return 1 - Number(decimalMicros(eurCostPerM)) / Number(priceEurMicros);
}

/** §6.4 planning assumption: a 50-question evaluation uses about 100k input and 15k output engine tokens. */
export const PLANNING_TOKENS_50Q = { input: 100_000, output: 15_000 } as const;
/** Engine credits for that run on one rate, to the nearest credit like the §6.4 last column (a planning figure, not a charge). */
export function planningRunCredits(rate: Pick<ModelRate, "inputUcrPerM" | "outputUcrPerM">, tokens: { input: number; output: number } = PLANNING_TOKENS_50Q): bigint {
  const ucr = (BigInt(tokens.input) * rate.inputUcrPerM + BigInt(tokens.output) * rate.outputUcrPerM + MICRO - ONE) / MICRO;
  return (ucr + UCR_PER_CREDIT / BigInt(2)) / UCR_PER_CREDIT;
}

/* ---------------------------------------------------- provider keys --- */

const PROVIDER_HOSTS: Readonly<Record<string, string>> = {
  "openrouter.ai": "openrouter", "generativelanguage.googleapis.com": "google", "api.openai.com": "openai",
  "api.anthropic.com": "anthropic", "api.mistral.ai": "mistral", "api.deepseek.com": "deepseek", "integrate.api.nvidia.com": "nvidia",
};
/** Mirrors billing.model_provider(): the key a model rate is filed under. */
export function modelProvider(adapter: string, endpoint: string | null | undefined): string {
  if (adapter === "dgx") return "dgx";
  const host = (endpoint ?? "").split("://")[1]?.split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
  return PROVIDER_HOSTS[host] ?? `host_${host.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 40);
}
/** Mirrors billing.model_key(). */
export function modelKey(provider: string, modelId: string): string {
  return provider === "google" ? modelId.replace(/^models\//, "") : modelId;
}

/* ----------------------------------------------------------- seed data --- */

export interface SeedModel {
  label: string; provider: string; modelId: string | null; minInputTokens: number;
  usdIn?: string; usdOut?: string; feeBps: number; credits: { input: number; output: number }; source: string;
}
/** Revision 1, exactly as seeded by migration 088 (spec §6.4). Tests check the formula reproduces every row. */
export const REVISION_1_FX = { usdPerEur: "1.1605", date: "2026-08-19", source: "ECB euro foreign exchange reference rate" } as const;
export const REVISION_1_MODELS: readonly SeedModel[] = [
  { label: "Caudals Local (DeepSeek V4 Flash on the DGX)", provider: "dgx", modelId: null, minInputTokens: 0, feeBps: 0, credits: { input: 50, output: 200 }, source: "Internal GPU-time estimate" },
  { label: "GPT-6 Luna (OpenAI)", provider: "openrouter", modelId: "openai/gpt-6-luna", minInputTokens: 0, usdIn: "0.10", usdOut: "0.50", feeBps: 550, credits: { input: 15, output: 70 }, source: "https://openrouter.ai/openai/gpt-6-luna" },
  { label: "Claude Haiku 5.5, prompts up to 100K (Anthropic)", provider: "openrouter", modelId: "anthropic/claude-haiku-5.5", minInputTokens: 0, usdIn: "0.10", usdOut: "0.50", feeBps: 550, credits: { input: 15, output: 70 }, source: "https://openrouter.ai/anthropic/claude-haiku-5.5" },
  { label: "Claude Haiku 5.5, prompts over 100K (Anthropic)", provider: "openrouter", modelId: "anthropic/claude-haiku-5.5", minInputTokens: 100_000, usdIn: "0.50", usdOut: "2.50", feeBps: 550, credits: { input: 70, output: 345 }, source: "https://www.anthropic.com/pricing" },
  { label: "Gemini 3.1 Flash-Lite (Google)", provider: "google", modelId: "gemini-3.1-flash-lite", minInputTokens: 0, usdIn: "0.25", usdOut: "1.50", feeBps: 0, credits: { input: 35, output: 195 }, source: "https://ai.google.dev/gemini-api/docs/pricing" },
  { label: "DeepSeek V4.1 Flash, peak hours (DeepSeek)", provider: "openrouter", modelId: "deepseek/deepseek-v4.1-flash", minInputTokens: 0, usdIn: "0.30", usdOut: "1.20", feeBps: 550, credits: { input: 45, output: 165 }, source: "https://api-docs.deepseek.com/quick_start/pricing" },
  { label: "Mistral Large (Mistral, EU)", provider: "openrouter", modelId: "mistralai/mistral-large-2512", minInputTokens: 0, usdIn: "0.50", usdOut: "1.50", feeBps: 550, credits: { input: 70, output: 205 }, source: "https://mistral.ai/pricing" },
  { label: "Gemini 3.8 Flash (Google)", provider: "google", modelId: "gemini-3.8-flash", minInputTokens: 0, usdIn: "0.75", usdOut: "3.75", feeBps: 0, credits: { input: 100, output: 485 }, source: "https://ai.google.dev/gemini-api/docs/pricing" },
  { label: "DeepSeek V4 Pro, peak hours (DeepSeek)", provider: "openrouter", modelId: "deepseek/deepseek-v4-pro", minInputTokens: 0, usdIn: "1.32", usdOut: "3.96", feeBps: 550, credits: { input: 180, output: 540 }, source: "https://api-docs.deepseek.com/quick_start/pricing" },
  { label: "Gemini 3.1 Pro preview, prompts up to 200K (Google)", provider: "google", modelId: "gemini-3.1-pro-preview", minInputTokens: 0, usdIn: "2.00", usdOut: "12.00", feeBps: 0, credits: { input: 260, output: 1555 }, source: "https://ai.google.dev/gemini-api/docs/pricing" },
  { label: "GPT-6.1 Sol (OpenAI)", provider: "openrouter", modelId: "openai/gpt-6.1-sol", minInputTokens: 0, usdIn: "2.00", usdOut: "10.00", feeBps: 550, credits: { input: 275, output: 1365 }, source: "https://openrouter.ai/openai/gpt-6.1-sol" },
  { label: "Claude Sonnet 5.5 (Anthropic)", provider: "openrouter", modelId: "anthropic/claude-sonnet-5.5", minInputTokens: 0, usdIn: "2.00", usdOut: "10.00", feeBps: 550, credits: { input: 275, output: 1365 }, source: "https://openrouter.ai/anthropic/claude-sonnet-5.5" },
  { label: "Claude Opus 5.5 (Anthropic)", provider: "openrouter", modelId: "anthropic/claude-opus-5.5", minInputTokens: 0, usdIn: "4.00", usdOut: "20.00", feeBps: 550, credits: { input: 550, output: 2730 }, source: "https://openrouter.ai/anthropic/claude-opus-5.5" },
];
/** §6.3 platform meters, in credits per unit. */
export const REVISION_1_ACTIONS: Readonly<Record<ActionMeter, string>> = {
  website_question: "5", api_question: "2", graded_answer: "1", web_page_read: "1", document_page: "0.5", web_search_query: "2",
};
export const REVISION_1_ID = "6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88";

/* -------------------------------------------------------- database --- */

type Row = Record<string, unknown>;
const big = (value: unknown) => BigInt(value as string | number);
const optionalBig = (value: unknown) => (value === null || value === undefined ? null : big(value));
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const dateText = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : text(value));

export function revisionFromRow(row: Row): PriceBookRevision {
  return {
    id: String(row.id), revision: Number(row.revision), status: row.status as RevisionStatus, title: String(row.title), notes: text(row.notes),
    effectiveAt: (row.effective_at as Date | null) ?? null, multiplier: String(row.multiplier), fxUsdPerEur: String(row.fx_usd_per_eur),
    fxDate: dateText(row.fx_date) ?? "", fxSource: String(row.fx_source), basedOnId: text(row.based_on_id),
    raisesPrices: (row.raises_prices as boolean | null) ?? null, noticeSentAt: (row.notice_sent_at as Date | null) ?? null,
    createdBy: String(row.created_by), createdAt: row.created_at as Date, scheduledAt: (row.scheduled_at as Date | null) ?? null,
    activatedAt: (row.activated_at as Date | null) ?? null, retiredAt: (row.retired_at as Date | null) ?? null,
  };
}
export function modelRateFromRow(row: Row): ModelRate {
  return {
    id: String(row.id), label: String(row.label), provider: String(row.provider), modelId: text(row.model_id),
    minInputTokens: Number(row.min_input_tokens), inputUcrPerM: big(row.input_ucr_per_m), outputUcrPerM: big(row.output_ucr_per_m),
    cachedUcrPerM: optionalBig(row.cached_ucr_per_m), costBasis: row.cost_basis as ModelRate["costBasis"],
    usdInputPerM: text(row.usd_input_per_m), usdOutputPerM: text(row.usd_output_per_m), usdCachedPerM: text(row.usd_cached_per_m),
    eurInputPerM: String(row.eur_input_per_m), eurOutputPerM: String(row.eur_output_per_m), routingFeeBps: Number(row.routing_fee_bps),
    source: String(row.source), sourceAccessedOn: dateText(row.source_accessed_on),
  };
}
function actionRateFromRow(row: Row): ActionRate {
  return { meter: row.meter as ActionMeter, unit: String(row.unit), ucrPerUnit: big(row.ucr_per_unit), label: String(row.label) };
}

export const PRICE_BOOK_ERROR_CODES = [
  "PRICE_BOOK_NOT_FOUND", "PRICE_BOOK_TRANSITION", "PRICE_BOOK_IMMUTABLE", "PRICE_BOOK_IN_EFFECT", "PRICE_BOOK_INCOMPLETE",
  "SCHEDULE_CONFLICT", "NOTICE_PERIOD_REQUIRED", "ROUTE_UNPRICED", "MODEL_PRICE_ZERO", "MODEL_RATE_MISSING", "SCOPE_DENIED",
  "INPUT_INVALID", "IDEMPOTENCY_CONFLICT",
] as const;
export type PriceBookErrorCode = typeof PRICE_BOOK_ERROR_CODES[number];
export class PriceBookError extends Error {
  constructor(readonly code: PriceBookErrorCode) { super(code); this.name = "PriceBookError"; }
}
const priceCodes = new Set<string>(PRICE_BOOK_ERROR_CODES);
/** Maps a database exception raised with one of the codes above; anything else is rethrown. */
export function priceBookError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (priceCodes.has(message)) throw new PriceBookError(message as PriceBookErrorCode);
  // Constraint failures on rates (the 5-credit grid, a duplicate model) are input errors.
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "23514" || code === "23505" || code === "22P02" || code === "23502") throw new PriceBookError("INPUT_INVALID");
  throw error;
}
async function query(db: PoolClient, sql: string, params: unknown[] = []) {
  try { return await db.query(sql, params); } catch (error) { priceBookError(error); }
}

/** The revision in effect at an instant (default now), with its rates. */
export async function getPriceBookAt(db: PoolClient, at: Date = new Date()): Promise<{ revision: PriceBookRevision; models: ModelRate[]; actions: ActionRate[] } | null> {
  const row = (await query(db, "SELECT * FROM billing.price_book_at($1::timestamptz) WHERE id IS NOT NULL", [at])).rows[0];
  return row ? getPriceBookRevision(db, String(row.id)) : null;
}

export async function getPriceBookRevision(db: PoolClient, id: string): Promise<{ revision: PriceBookRevision; models: ModelRate[]; actions: ActionRate[] } | null> {
  const row = (await query(db, "SELECT * FROM billing.price_book_revision WHERE id=$1", [id])).rows[0];
  if (!row) return null;
  const models = (await query(db, "SELECT * FROM billing.model_rate WHERE revision_id=$1 ORDER BY input_ucr_per_m, provider, model_id NULLS FIRST, min_input_tokens", [id])).rows.map(modelRateFromRow);
  const actions = (await query(db, "SELECT * FROM billing.action_rate WHERE revision_id=$1 ORDER BY meter", [id])).rows.map(actionRateFromRow);
  return { revision: revisionFromRow(row), models, actions };
}

export async function listPriceBookRevisions(db: PoolClient): Promise<PriceBookRevision[]> {
  return (await query(db, "SELECT * FROM billing.price_book_revision ORDER BY revision DESC LIMIT 200")).rows.map(revisionFromRow);
}

/** The credit rate for a provider revision's model under a price-book revision (default: the one in effect). */
export async function rateForProviderRevision(db: PoolClient, providerRevisionId: string, priceBookRevisionId?: string, inputTokens = 0): Promise<ModelRate | null> {
  const row = (await query(db, `SELECT m.* FROM billing.provider_revision_rate_key($1::uuid) k
    CROSS JOIN LATERAL billing.rate_for(coalesce($2::uuid, (billing.price_book_at(now())).id), k.provider, k.model_key, $3::integer) m
    WHERE m.id IS NOT NULL`, [providerRevisionId, priceBookRevisionId ?? null, inputTokens])).rows[0];
  return row ? modelRateFromRow(row) : null;
}

/* ------------------------------------------------- operator changes --- */

const decimal = z.string().trim().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
const creditAmount = z.union([z.string().trim().regex(/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/), z.number().nonnegative().max(1e9)]);
const modelChangeSchema = z.strictObject({
  provider: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  modelId: z.string().trim().min(1).max(200).nullable(),
  minInputTokens: z.number().int().min(0).max(10_000_000).default(0),
  /** Removes the model from the new revision. */
  remove: z.boolean().optional(),
  label: z.string().trim().min(2).max(200).optional(),
  costBasis: z.enum(["list_price", "internal_estimate"]).optional(),
  usdInputPerM: decimal.optional(),
  usdOutputPerM: decimal.optional(),
  usdCachedPerM: decimal.nullable().optional(),
  routingFeeBps: z.number().int().min(0).max(5000).optional(),
  /** internal_estimate only: the rate in credits per 1M tokens, and the cost estimate behind it. */
  credits: z.strictObject({ input: creditAmount, output: creditAmount, cached: creditAmount.nullable().optional() }).optional(),
  eurInputPerM: decimal.optional(),
  eurOutputPerM: decimal.optional(),
  source: z.string().trim().min(3).max(500).optional(),
  sourceAccessedOn: z.iso.date().optional(),
});
export const draftInputSchema = z.strictObject({
  title: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(4000).optional(),
  /** Defaults to the revision in effect. */
  basedOn: z.uuid().optional(),
  multiplier: decimal.optional(),
  /** Defaults to the latest recorded ECB rate. */
  fx: z.strictObject({ usdPerEur: decimal, date: z.iso.date(), source: z.string().trim().min(3).max(300) }).optional(),
  models: z.array(modelChangeSchema).max(200).default([]),
  actions: z.array(z.strictObject({ meter: z.enum(ACTION_METERS), credits: creditAmount })).max(6).default([]),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

type ModelRow = {
  label: string; provider: string; model_id: string | null; min_input_tokens: number; input_ucr_per_m: string; output_ucr_per_m: string;
  cached_ucr_per_m: string | null; cost_basis: "list_price" | "internal_estimate"; usd_input_per_m: string | null; usd_output_per_m: string | null;
  usd_cached_per_m: string | null; eur_input_per_m: string; eur_output_per_m: string; routing_fee_bps: number; source: string; source_accessed_on: string | null;
};
const keyOf = (provider: string, modelId: string | null, minInputTokens: number) => `${provider}\u0000${modelId ?? ""}\u0000${minInputTokens}`;
const trimDecimal = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
};

/** A list-price row recomputed for an FX rate and multiplier. */
function listPriceRow(base: Omit<ModelRow, "input_ucr_per_m" | "output_ucr_per_m" | "cached_ucr_per_m" | "eur_input_per_m" | "eur_output_per_m">, fx: string, multiplier: string): ModelRow {
  const cost = (usd: string) => ({ usdPerMillion: usd, fxUsdPerEur: fx, routingFeeBps: base.routing_fee_bps, multiplier });
  if (!base.usd_input_per_m || !base.usd_output_per_m) throw new PriceBookError("INPUT_INVALID");
  return {
    ...base,
    input_ucr_per_m: creditRateUcrPerMillion(cost(base.usd_input_per_m)).toString(),
    output_ucr_per_m: creditRateUcrPerMillion(cost(base.usd_output_per_m)).toString(),
    cached_ucr_per_m: base.usd_cached_per_m ? creditRateUcrPerMillion(cost(base.usd_cached_per_m)).toString() : null,
    eur_input_per_m: eurCostPerMillion(cost(base.usd_input_per_m)),
    eur_output_per_m: eurCostPerMillion(cost(base.usd_output_per_m)),
  };
}

/**
 * Builds a draft's full rate list: the base revision's rows (list-price rows
 * recomputed for the draft's FX and multiplier), then each change applied by
 * (provider, model, tier). Pure: exported for tests.
 */
export function composeDraftRates(base: { models: ModelRate[]; actions: ActionRate[] }, input: DraftInput, fx: string, multiplier: string): { models: ModelRow[]; actions: Array<{ meter: ActionMeter; unit: string; ucr_per_unit: string; label: string }> } {
  const rows = new Map<string, ModelRow>();
  for (const rate of base.models) {
    const common = {
      label: rate.label, provider: rate.provider, model_id: rate.modelId, min_input_tokens: rate.minInputTokens, cost_basis: rate.costBasis,
      usd_input_per_m: rate.usdInputPerM, usd_output_per_m: rate.usdOutputPerM, usd_cached_per_m: rate.usdCachedPerM,
      routing_fee_bps: rate.routingFeeBps, source: rate.source, source_accessed_on: rate.sourceAccessedOn,
    };
    rows.set(keyOf(rate.provider, rate.modelId, rate.minInputTokens), rate.costBasis === "list_price" ? listPriceRow(common, fx, multiplier) : {
      ...common, input_ucr_per_m: rate.inputUcrPerM.toString(), output_ucr_per_m: rate.outputUcrPerM.toString(),
      cached_ucr_per_m: rate.cachedUcrPerM?.toString() ?? null, eur_input_per_m: rate.eurInputPerM, eur_output_per_m: rate.eurOutputPerM,
    });
  }
  for (const change of input.models) {
    const key = keyOf(change.provider, change.modelId, change.minInputTokens);
    if (change.remove) { rows.delete(key); continue; }
    const previous = rows.get(key);
    const basis = change.costBasis ?? previous?.cost_basis ?? "list_price";
    const label = change.label ?? previous?.label;
    const source = change.source ?? previous?.source;
    if (!label || !source) throw new PriceBookError("INPUT_INVALID");
    const common = {
      label, provider: change.provider, model_id: change.modelId, min_input_tokens: change.minInputTokens, cost_basis: basis,
      routing_fee_bps: change.routingFeeBps ?? previous?.routing_fee_bps ?? (change.provider === "openrouter" ? OPENROUTER_FEE_BPS : 0),
      source, source_accessed_on: change.sourceAccessedOn ?? previous?.source_accessed_on ?? null,
    };
    if (basis === "list_price") {
      if (change.credits) throw new PriceBookError("INPUT_INVALID");
      rows.set(key, listPriceRow({
        ...common,
        usd_input_per_m: change.usdInputPerM ?? previous?.usd_input_per_m ?? null,
        usd_output_per_m: change.usdOutputPerM ?? previous?.usd_output_per_m ?? null,
        usd_cached_per_m: change.usdCachedPerM === undefined ? previous?.usd_cached_per_m ?? null : change.usdCachedPerM,
      }, fx, multiplier));
    } else {
      const credits = change.credits;
      if (!credits && !previous) throw new PriceBookError("INPUT_INVALID");
      const grid = (value: string | number) => { try { return gridRateUcr(value).toString(); } catch { throw new PriceBookError("INPUT_INVALID"); } };
      rows.set(key, {
        ...common, usd_input_per_m: null, usd_output_per_m: null, usd_cached_per_m: null,
        input_ucr_per_m: credits ? grid(credits.input) : previous!.input_ucr_per_m,
        output_ucr_per_m: credits ? grid(credits.output) : previous!.output_ucr_per_m,
        cached_ucr_per_m: credits ? (credits.cached == null ? null : grid(credits.cached)) : previous!.cached_ucr_per_m,
        eur_input_per_m: change.eurInputPerM ?? previous?.eur_input_per_m ?? "0",
        eur_output_per_m: change.eurOutputPerM ?? previous?.eur_output_per_m ?? "0",
      });
    }
  }
  const actions = new Map(base.actions.map(action => [action.meter, { meter: action.meter, unit: action.unit, ucr_per_unit: action.ucrPerUnit.toString(), label: action.label }]));
  for (const change of input.actions) {
    let ucr: bigint;
    try { ucr = creditsToUcr(change.credits); } catch { throw new PriceBookError("INPUT_INVALID"); }
    if (ucr <= ZERO) throw new PriceBookError("INPUT_INVALID");
    const previous = actions.get(change.meter);
    actions.set(change.meter, { meter: change.meter, unit: METER_UNITS[change.meter], ucr_per_unit: ucr.toString(), label: previous?.label ?? change.meter.replaceAll("_", " ") });
  }
  return { models: [...rows.values()], actions: [...actions.values()] };
}

/** Creates a draft revision from the base revision (default: the one in effect), the latest FX and the changes. Platform admins and services. */
export async function createPriceBookDraft(db: PoolClient, raw: unknown) {
  const input = draftInputSchema.parse(raw);
  const base = input.basedOn ? await getPriceBookRevision(db, input.basedOn) : await getPriceBookAt(db);
  if (!base) throw new PriceBookError("PRICE_BOOK_NOT_FOUND");
  const latestFx = (await query(db, "SELECT per_eur::text AS per_eur, rate_date, source FROM billing.fx_rate WHERE currency='USD' ORDER BY rate_date DESC LIMIT 1")).rows[0];
  const fx = input.fx ?? (latestFx ? { usdPerEur: trimDecimal(String(latestFx.per_eur)), date: dateText(latestFx.rate_date)!, source: String(latestFx.source) }
    : { usdPerEur: trimDecimal(base.revision.fxUsdPerEur), date: base.revision.fxDate, source: base.revision.fxSource });
  const multiplier = input.multiplier ?? trimDecimal(base.revision.multiplier);
  const rates = composeDraftRates(base, input, fx.usdPerEur, multiplier);
  const row = (await query(db, "SELECT * FROM billing.create_price_book_draft($1,$2,$3::numeric,$4::numeric,$5::date,$6,$7::uuid,$8::jsonb,$9::jsonb)", [
    input.title, input.notes ?? null, multiplier, fx.usdPerEur, fx.date, fx.source, base.revision.id, JSON.stringify(rates.models), JSON.stringify(rates.actions),
  ])).rows[0];
  return getPriceBookRevision(db, String(row.id));
}

export async function schedulePriceBook(db: PoolClient, id: string, effectiveAt: Date): Promise<PriceBookRevision> {
  return revisionFromRow((await query(db, "SELECT * FROM billing.schedule_price_book($1::uuid,$2::timestamptz)", [id, effectiveAt])).rows[0]);
}
export async function cancelPriceBook(db: PoolClient, id: string): Promise<PriceBookRevision> {
  return revisionFromRow((await query(db, "SELECT * FROM billing.cancel_price_book($1::uuid)", [id])).rows[0]);
}
export async function activatePriceBook(db: PoolClient, id: string): Promise<PriceBookRevision> {
  return revisionFromRow((await query(db, "SELECT * FROM billing.activate_price_book($1::uuid)", [id])).rows[0]);
}
/** The hourly job: scheduled revisions that are due become active (their prices already apply by date). */
export async function activateDuePriceBooks(db: PoolClient): Promise<PriceBookRevision[]> {
  return (await query(db, "SELECT * FROM billing.activate_due_price_books()")).rows.map(revisionFromRow);
}

export interface RouteIssue { scope: "platform" | "workspace" | "evaluation"; orgId: string | null; evaluationId: string | null; role: string; providerRevisionId: string; provider: string; modelId: string; issue: string | null }
/** Every customer route and whether the €0 guard would accept it (platform admins and services). */
export async function routePriceIssues(db: PoolClient, priceBookRevisionId?: string): Promise<RouteIssue[]> {
  return (await query(db, "SELECT * FROM billing.route_price_issues($1::uuid)", [priceBookRevisionId ?? null])).rows.map(row => ({
    scope: row.scope, orgId: row.org_id, evaluationId: row.evaluation_id, role: row.role, providerRevisionId: row.provider_revision_id,
    provider: row.provider, modelId: row.model_id, issue: row.issue,
  }));
}

/** JSON view of a revision for the admin API (µcr as strings, credits alongside, margins and §6.4 run impact). */
export function revisionView(book: { revision: PriceBookRevision; models: ModelRate[]; actions: ActionRate[] }) {
  return {
    ...book.revision,
    models: book.models.map(rate => ({
      ...rate,
      inputUcrPerM: rate.inputUcrPerM.toString(), outputUcrPerM: rate.outputUcrPerM.toString(), cachedUcrPerM: rate.cachedUcrPerM?.toString() ?? null,
      credits: { input: ucrToCredits(rate.inputUcrPerM), output: ucrToCredits(rate.outputUcrPerM), cached: rate.cachedUcrPerM === null ? null : ucrToCredits(rate.cachedUcrPerM) },
      margin: { input: Number(tokenMargin(rate.eurInputPerM, rate.inputUcrPerM).toFixed(4)), output: Number(tokenMargin(rate.eurOutputPerM, rate.outputUcrPerM).toFixed(4)) },
      planningRunCredits50: Number(planningRunCredits(rate)),
    })),
    actions: book.actions.map(action => ({ ...action, ucrPerUnit: action.ucrPerUnit.toString(), credits: ucrToCredits(action.ucrPerUnit) })),
  };
}
