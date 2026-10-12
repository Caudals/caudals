/**
 * Weekly provider-price check and monthly ECB FX update (launch spec v2
 * §6.4 "How prices get updated"). No paid calls: OpenRouter's public models
 * API (free, no key) and the ECB's daily reference-rate XML.
 *
 * The check compares every list-priced model rate in the revision in effect
 * with the provider's current listing and reports each difference. A rate is
 * flagged for recomputation when its cost (list price × routing fee / FX)
 * moves more than 3 % in either direction; decreases apply immediately and
 * increases need 30 days' notice (billing.schedule_price_book enforces it).
 * Google-direct rows are compared with OpenRouter's listing of the same
 * model, which passes Google's list price through (marked as a proxy).
 */
import type { PoolClient } from "pg";
import { creditRateUcrPerMillion, decimalMicros, getPriceBookAt, type ModelRate } from "./price-book";
import { ucrToCredits } from "./units";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
/** §6.4: credit rates are recomputed when provider cost or FX moves more than 3 %. */
export const RECOMPUTE_THRESHOLD = 0.03;

export interface Listing { id: string; usdInputPerM: string | null; usdOutputPerM: string | null; usdCachedPerM: string | null }
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** USD per token as published ("0.0000001") → USD per 1M tokens with six decimals ("0.100000"), exact. */
export function perTokenToPerMillion(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,18}))?$/.exec(text);
  if (!match) return null;
  // value × 10^6 with six decimals: shift the decimal point by 12 in total.
  const digits = BigInt(match[1] + (match[2] ?? "").padEnd(18, "0")); // value × 10^18
  // Millionths of a USD per 1M tokens = value × 10^12 = digits / 10^6, rounded half-up.
  const micros = digits / BigInt(1_000_000);
  const remainder = digits % BigInt(1_000_000);
  const rounded = remainder * BigInt(2) >= BigInt(1_000_000) ? micros + BigInt(1) : micros;
  const whole = rounded / BigInt(1_000_000), fraction = (rounded % BigInt(1_000_000)).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

export function parseOpenRouterModels(body: unknown): Map<string, Listing> {
  const listings = new Map<string, Listing>();
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("openrouter_models_invalid");
  for (const item of data.slice(0, 5000)) {
    const id = (item as { id?: unknown })?.id, pricing = (item as { pricing?: Record<string, unknown> })?.pricing;
    if (typeof id !== "string" || !pricing || typeof pricing !== "object") continue;
    listings.set(id, {
      id, usdInputPerM: perTokenToPerMillion(pricing.prompt), usdOutputPerM: perTokenToPerMillion(pricing.completion),
      usdCachedPerM: perTokenToPerMillion(pricing.input_cache_read),
    });
  }
  return listings;
}

export async function fetchOpenRouterListings(fetchImpl: Fetch = fetch): Promise<Map<string, Listing>> {
  const response = await fetchImpl(OPENROUTER_MODELS_URL, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error("openrouter_models_unavailable");
  return parseOpenRouterModels(await response.json());
}

/** The USD reference rate and its date from the ECB daily XML. */
export function parseEcbDaily(xml: string): { date: string; usdPerEur: string } {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const rate = /<Cube\s+currency=['"]USD['"]\s+rate=['"](\d+(?:\.\d{1,6})?)['"]/.exec(xml)?.[1];
  if (!date || !rate) throw new Error("ecb_rate_invalid");
  decimalMicros(rate);
  return { date, usdPerEur: rate };
}

export async function fetchEcbUsdRate(fetchImpl: Fetch = fetch): Promise<{ date: string; usdPerEur: string }> {
  const response = await fetchImpl(ECB_DAILY_URL, { headers: { accept: "application/xml" }, redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error("ecb_rate_unavailable");
  return parseEcbDaily((await response.text()).slice(0, 200_000));
}

/** First Monday-to-Friday day of the month (UTC). TARGET holidays are ignored: the ECB date settles it. */
export function firstWorkingDay(year: number, month: number): Date {
  const day = new Date(Date.UTC(year, month, 1));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return day;
}
/** The monthly FX update is due once this month's first working day's rate can exist (after 15:00 UTC) and none is recorded for the month. */
export function fxUpdateDue(latestRateDate: string | null, now = new Date()): boolean {
  const first = firstWorkingDay(now.getUTCFullYear(), now.getUTCMonth());
  const ready = now.getTime() >= first.getTime() + 15 * 3_600_000;
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return ready && (!latestRateDate || latestRateDate < monthStart);
}
/** The provider-price check runs weekly. */
export function priceCheckDue(lastCheckedAt: Date | null, now = new Date()): boolean {
  return !lastCheckedAt || now.getTime() - lastCheckedAt.getTime() >= 7 * 86_400_000;
}

export interface RateChange {
  label: string; provider: string; modelId: string | null; minInputTokens: number; listing: string | null; proxy: boolean;
  status: "unchanged" | "changed" | "unavailable";
  input?: { book: string; listed: string; change: number };
  output?: { book: string; listed: string; change: number };
  /** True when the cost moved more than 3 % (list price or FX): recompute the credit rate. */
  recompute: boolean;
  credits?: { input: { book: string; recomputed: string }; output: { book: string; recomputed: string } };
}
export interface PriceCheckReport {
  revision: { id: string; revision: number };
  fx: { book: string; current: string; date: string; change: number } | null;
  checked: number; changed: number; unavailable: number;
  changes: RateChange[];
}

const ratio = (from: string, to: string) => {
  const a = Number(decimalMicros(from)), b = Number(decimalMicros(to));
  return a === 0 ? (b === 0 ? 0 : 1) : (b - a) / a;
};
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** OpenRouter id for a price-book row, and whether it is a proxy listing. */
export function listingIdFor(rate: Pick<ModelRate, "provider" | "modelId">): { id: string; proxy: boolean } | null {
  if (!rate.modelId) return null;
  if (rate.provider === "openrouter") return { id: rate.modelId, proxy: false };
  if (["google", "openai", "anthropic", "mistral", "deepseek"].includes(rate.provider)) {
    const vendor = rate.provider === "mistral" ? "mistralai" : rate.provider;
    return { id: `${vendor}/${rate.modelId}`, proxy: true };
  }
  return null;
}

/** Compares a revision's list-priced rates with current listings and FX. Pure. */
export function comparePriceBook(
  book: { revision: { id: string; revision: number; fxUsdPerEur: string; multiplier: string }; models: ModelRate[] },
  listings: Map<string, Listing>,
  currentFx: { usdPerEur: string; date: string } | null,
  threshold = RECOMPUTE_THRESHOLD,
): PriceCheckReport {
  const bookFx = book.revision.fxUsdPerEur;
  const fxChange = currentFx ? ratio(bookFx, currentFx.usdPerEur) : 0;
  // Cost is USD / FX: a stronger euro lowers it. |Δcost| from FX alone ≈ |1/(1+Δfx) − 1|.
  const fxCostChange = currentFx ? Math.abs(1 / (1 + fxChange) - 1) : 0;
  const fx = currentFx?.usdPerEur ?? bookFx;
  const changes: RateChange[] = [];
  let checked = 0, changed = 0, unavailable = 0;
  for (const rate of book.models) {
    if (rate.costBasis !== "list_price" || !rate.usdInputPerM || !rate.usdOutputPerM) continue;
    checked++;
    const target = listingIdFor(rate);
    const listing = target ? listings.get(target.id) : undefined;
    const base = { label: rate.label, provider: rate.provider, modelId: rate.modelId, minInputTokens: rate.minInputTokens, listing: target?.id ?? null, proxy: target?.proxy ?? false };
    // OpenRouter lists one flat price: prompt-size tiers cannot be checked there.
    if (!listing || rate.minInputTokens > 0 || !listing.usdInputPerM || !listing.usdOutputPerM) {
      unavailable++;
      changes.push({ ...base, status: "unavailable", recompute: fxCostChange > threshold });
      continue;
    }
    const input = { book: rate.usdInputPerM, listed: listing.usdInputPerM, change: round4(ratio(rate.usdInputPerM, listing.usdInputPerM)) };
    const output = { book: rate.usdOutputPerM, listed: listing.usdOutputPerM, change: round4(ratio(rate.usdOutputPerM, listing.usdOutputPerM)) };
    const moved = input.change !== 0 || output.change !== 0;
    const costMove = (change: number) => Math.abs((1 + change) / (1 + fxChange) - 1);
    const recompute = costMove(input.change) > threshold || costMove(output.change) > threshold;
    const recomputed = (usd: string) => ucrToCredits(creditRateUcrPerMillion({ usdPerMillion: usd, fxUsdPerEur: fx, routingFeeBps: rate.routingFeeBps, multiplier: book.revision.multiplier }));
    if (moved) changed++;
    changes.push({
      ...base, status: moved ? "changed" : "unchanged", input, output, recompute,
      credits: {
        input: { book: ucrToCredits(rate.inputUcrPerM), recomputed: recomputed(listing.usdInputPerM) },
        output: { book: ucrToCredits(rate.outputUcrPerM), recomputed: recomputed(listing.usdOutputPerM) },
      },
    });
  }
  return {
    revision: { id: book.revision.id, revision: book.revision.revision },
    fx: currentFx ? { book: bookFx, current: currentFx.usdPerEur, date: currentFx.date, change: round4(fxChange) } : null,
    checked, changed, unavailable, changes,
  };
}

/** A short Markdown diff report for ops. */
export function priceCheckMarkdown(report: PriceCheckReport, checkedAt = new Date()): string {
  const pct = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;
  const usd = (value: string) => String(Number(value));
  const lines = [
    `# Provider price check · revision ${report.revision.revision} · ${checkedAt.toISOString().slice(0, 10)}`,
    "",
    report.fx ? `FX: book ${report.fx.book} USD/EUR, ECB ${report.fx.current} on ${report.fx.date} (${pct(report.fx.change)}).` : "FX: not checked.",
    `Checked ${report.checked} list-priced rates: ${report.changed} changed, ${report.unavailable} not listed.`,
    "",
    "| Model | Listing | Input $/1M (book → now) | Output $/1M (book → now) | Credits per 1M now | Recompute |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const change of report.changes) {
    if (change.status === "unchanged" && !change.recompute) continue;
    const listing = change.listing ? `${change.listing}${change.proxy ? " (proxy)" : ""}` : "—";
    if (change.status === "unavailable") {
      lines.push(`| ${change.label} | ${listing} | not listed | not listed | — | ${change.recompute ? "yes (FX)" : "no"} |`);
      continue;
    }
    lines.push(`| ${change.label} | ${listing} | ${usd(change.input!.book)} → ${usd(change.input!.listed)} (${pct(change.input!.change)}) | ${usd(change.output!.book)} → ${usd(change.output!.listed)} (${pct(change.output!.change)}) | ${change.credits!.input.recomputed} · ${change.credits!.output.recomputed} (book ${change.credits!.input.book} · ${change.credits!.output.book}) | ${change.recompute ? "yes" : "no"} |`);
  }
  if (lines.length === 7) lines.push("| — | — | no changes | — | — | — |");
  lines.push("", "Decreases apply immediately; increases need 30 days' notice (spec v2 §6.4). Draft a revision with POST /api/evals/v1/billing/admin/price-book/revisions.");
  return lines.join("\n");
}

/** The revision in effect and the latest recorded ECB rate (read before any network call). */
export async function loadPriceCheckState(db: PoolClient) {
  const book = await getPriceBookAt(db);
  const row = (await db.query("SELECT per_eur::text AS per_eur, to_char(rate_date,'YYYY-MM-DD') AS rate_date FROM billing.fx_rate WHERE currency='USD' ORDER BY rate_date DESC LIMIT 1")).rows[0];
  const lastCheck = (await db.query("SELECT max(checked_at) AS at FROM billing.price_check")).rows[0]?.at as Date | null;
  return { book, fx: row ? { usdPerEur: String(row.per_eur).replace(/\.?0+$/, ""), date: String(row.rate_date) } : null, lastCheck: lastCheck ?? null };
}

/** Stores a check (billing.record_price_check): the changed and recompute rows only. */
export async function recordPriceCheck(db: PoolClient, report: PriceCheckReport) {
  const changes = report.changes.filter(change => change.status !== "unchanged" || change.recompute);
  const row = (await db.query("SELECT * FROM billing.record_price_check($1::uuid,$2::numeric,$3::date,$4,$5,$6,$7::jsonb)", [
    report.revision.id, report.fx?.current ?? null, report.fx?.date ?? null, report.checked, report.changed, report.unavailable, JSON.stringify(changes),
  ])).rows[0];
  return { id: String(row.id), checkedAt: row.checked_at as Date };
}

/** Records the ECB rate (billing.record_fx_rate). */
export async function recordFxRate(db: PoolClient, rate: { date: string; usdPerEur: string }) {
  await db.query("SELECT * FROM billing.record_fx_rate('USD',$1::date,$2::numeric,$3)", [rate.date, rate.usdPerEur, "ECB euro foreign exchange reference rate (eurofxref-daily)"]);
}
