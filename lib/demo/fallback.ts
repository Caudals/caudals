import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { numberEnv } from "./config";
import { safeDemoSecret } from "./model-settings";

/**
 * The demo's commercial fallback model and its daily euro cap.
 *
 * Every fallback call reserves its worst-case cost before it starts and
 * settles the real cost afterwards (demo.fallback_usage, migration 083). The
 * reservation is one conditional upsert, so concurrent calls in any number of
 * processes can never push settled spend plus open holds over the cap.
 */

export const DEFAULT_FALLBACK_ENDPOINT = "https://openrouter.ai/api/v1";
/** Gemini 3.1 Flash-Lite on OpenRouter: list price USD 0.25 in / 1.50 out per million tokens (2026-10-11). */
export const DEFAULT_FALLBACK_MODEL = "google/gemini-3.1-flash-lite";

export type FallbackConfig = {
  endpoint: string;
  model: string;
  key: string | undefined;
  dailyCapEur: number;
  inputEurPerMTok: number;
  outputEurPerMTok: number;
  /** Provider-reported USD costs are converted with this rate; 1 overstates euros, which keeps the cap conservative. */
  usdToEur: number;
};

export function fallbackConfig(): FallbackConfig {
  const base = (process.env.DEMO_FALLBACK_ENDPOINT?.trim() || DEFAULT_FALLBACK_ENDPOINT).replace(/\/+$/, "");
  return {
    endpoint: base.endsWith("/chat/completions") ? base : `${base}/chat/completions`,
    model: process.env.DEMO_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL,
    key: safeDemoSecret("DEMO_FALLBACK_API_KEY") ?? safeDemoSecret("DEMO_OPENROUTER_API_KEY"),
    dailyCapEur: numberEnv("DEMO_FALLBACK_DAILY_EUR", 5),
    inputEurPerMTok: numberEnv("DEMO_FALLBACK_INPUT_EUR_PER_MTOK", 0.25),
    outputEurPerMTok: numberEnv("DEMO_FALLBACK_OUTPUT_EUR_PER_MTOK", 1.5),
    usdToEur: numberEnv("DEMO_FALLBACK_USD_EUR", 1, 0.01),
  };
}

/** Euros with six decimals, rounded up so a hold never understates a cost. */
export function eurCeil(value: number) {
  return Math.ceil(Math.max(0, value) * 1e6) / 1e6;
}

/**
 * Reserve one token per UTF-8 byte, framing overhead and the whole output
 * limit. Average characters-per-token estimates are unsafe for dense text.
 * The caller also caps provider prices at these rates (including zero
 * per-request fees). The extra quarter covers framing/provider rounding.
 */
export function holdFor(inputBytes: number, maxTokens: number, config = fallbackConfig()) {
  const inputTokens = Math.ceil(inputBytes) + 4096;
  return eurCeil(((inputTokens * config.inputEurPerMTok + maxTokens * config.outputEurPerMTok) / 1e6) * 1.25);
}

/** What one demo usually needs on the fallback: one question-writing and one grading call. */
export function runEstimateEur(config = fallbackConfig()) {
  return eurCeil(holdFor(30_000, 4_500, config) + holdFor(14_000, 3_500, config));
}

/** The settled cost of a call, from the provider's own figure or the token counts. */
export function costOf(usage: { cost?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined, hold: number, config = fallbackConfig()) {
  if (!usage) return hold;
  if (typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0) return eurCeil(usage.cost * config.usdToEur);
  const input = usage.prompt_tokens, output = usage.completion_tokens;
  if (typeof input === "number" && typeof output === "number" && Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
    return eurCeil((input * config.inputEurPerMTok + output * config.outputEurPerMTok) / 1e6);
  }
  return hold;
}

export type Reservation = { day: string; eur: number };

const today = "(now() AT TIME ZONE 'utc')::date";

/** Holds `eur` on today's fallback budget, or returns null when it would pass the cap. */
export async function reserveFallback(eur: number, capEur = fallbackConfig().dailyCapEur): Promise<Reservation | null> {
  const hold = eurCeil(eur).toFixed(6);
  const cap = Math.max(0, capEur).toFixed(6);
  const { rows } = await getPostgresPool().query<{ day: string }>(
    `INSERT INTO demo.fallback_usage AS u (day, reserved_eur, calls)
     SELECT ${today}, $1::numeric, 1 WHERE $1::numeric <= $2::numeric
     ON CONFLICT (day) DO UPDATE SET reserved_eur = u.reserved_eur + EXCLUDED.reserved_eur, calls = u.calls + 1, updated_at = now()
       WHERE u.eur + u.reserved_eur + EXCLUDED.reserved_eur <= $2::numeric
     RETURNING to_char(day, 'YYYY-MM-DD') AS day`,
    [hold, cap],
  );
  return rows[0] ? { day: rows[0].day, eur: Number(hold) } : null;
}

/** Releases a hold and records what the call really cost (zero when nothing was charged). */
export async function settleFallback(reservation: Reservation, actualEur: number) {
  await getPostgresPool().query(
    `UPDATE demo.fallback_usage SET reserved_eur = greatest(reserved_eur - $2::numeric, 0), eur = eur + $3::numeric, updated_at = now()
     WHERE day = $1::date`,
    [reservation.day, eurCeil(reservation.eur).toFixed(6), eurCeil(actualEur).toFixed(6)],
  );
}

export type FallbackBudget = { capEur: number; spentEur: number; reservedEur: number; remainingEur: number; calls: number };

export async function fallbackBudget(capEur = fallbackConfig().dailyCapEur): Promise<FallbackBudget> {
  const { rows } = await getPostgresPool().query<{ eur: string; reserved_eur: string; calls: number }>(
    `SELECT eur, reserved_eur, calls FROM demo.fallback_usage WHERE day = ${today}`,
  );
  const spent = Number(rows[0]?.eur ?? 0), reserved = Number(rows[0]?.reserved_eur ?? 0);
  return { capEur, spentEur: spent, reservedEur: reserved, remainingEur: Math.max(0, capEur - spent - reserved), calls: rows[0]?.calls ?? 0 };
}
