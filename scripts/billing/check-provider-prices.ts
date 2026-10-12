/**
 * Provider-price check and ECB FX (launch spec v2 §6.4; package L-10).
 *
 * Compares the list-priced model rates of the price book in effect with
 * OpenRouter's public models API and the ECB daily reference rate, and prints
 * a diff report. No paid calls and no keys: both sources are free and public.
 * The evaluation scheduler runs the same check weekly and the FX update
 * monthly; this script is for ops on demand.
 *
 *   npx tsx scripts/billing/check-provider-prices.ts            # seed price book, live sources, Markdown
 *   npx tsx scripts/billing/check-provider-prices.ts --json
 *   BILLING_DATABASE_URL_FILE=… npx tsx scripts/billing/check-provider-prices.ts [--record] [--record-fx]
 *
 * With a database URL (a non-owner runtime login) it reads the revision in
 * effect; --record stores the check (billing.record_price_check) and
 * --record-fx the ECB rate (billing.record_fx_rate), as a system actor.
 */
import { Pool, type PoolClient } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";
import { REVISION_1_FX, REVISION_1_ID, REVISION_1_MODELS, type ModelRate } from "../../lib/billing/price-book";
import {
  comparePriceBook, fetchEcbUsdRate, fetchOpenRouterListings, loadPriceCheckState, priceCheckMarkdown, recordFxRate, recordPriceCheck,
} from "../../lib/billing/price-check";

const ACTOR = "system:price-check-script";

/** Revision 1 exactly as migration 088 seeds it, for runs without a database. */
function seedBook() {
  const models: ModelRate[] = REVISION_1_MODELS.map((model, index) => ({
    id: `seed-${index}`, label: model.label, provider: model.provider, modelId: model.modelId, minInputTokens: model.minInputTokens,
    inputUcrPerM: BigInt(model.credits.input) * BigInt(1_000_000), outputUcrPerM: BigInt(model.credits.output) * BigInt(1_000_000), cachedUcrPerM: null,
    costBasis: model.usdIn ? "list_price" : "internal_estimate", usdInputPerM: model.usdIn ?? null, usdOutputPerM: model.usdOut ?? null,
    usdCachedPerM: null, eurInputPerM: "0", eurOutputPerM: "0", routingFeeBps: model.feeBps, source: model.source, sourceAccessedOn: "2026-10-11",
  }));
  return { revision: { id: REVISION_1_ID, revision: 1, fxUsdPerEur: REVISION_1_FX.usdPerEur, multiplier: "1.5" }, models };
}

async function tx<T>(pool: Pool, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('evals.org_id','',true), set_config('evals.actor_id',$1,true)", [ACTOR]);
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = getSecretEnvValue("BILLING_DATABASE_URL");
  const pool = url ? new Pool({ connectionString: url, max: 1 }) : null;
  try {
    const state = pool ? await tx(pool, loadPriceCheckState) : null;
    if (pool && !state?.book) throw new Error("price_book_missing");
    const book = state?.book ? { revision: state.book.revision, models: state.book.models } : seedBook();
    const [listings, ecb] = await Promise.all([fetchOpenRouterListings(), fetchEcbUsdRate().catch(() => null)]);
    const fx = ecb ?? state?.fx ?? null;
    const report = comparePriceBook(book, listings, fx);
    if (pool && args.has("--record")) await tx(pool, db => recordPriceCheck(db, report));
    if (pool && args.has("--record-fx") && ecb) await tx(pool, db => recordFxRate(db, ecb));
    console.log(args.has("--json") ? JSON.stringify(report, null, 2) : priceCheckMarkdown(report));
    if (!pool) console.log("\n(Compared with the seeded revision 1; set BILLING_DATABASE_URL(_FILE) to read the revision in effect.)");
  } finally {
    await pool?.end();
  }
}

main().catch(error => {
  console.error(`Price check failed: ${error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
