/**
 * Sector packs and monthly new questions (launch L-25), read on the server at
 * request time and passed to client components as props. Off unless
 * `SECTOR_PACKS_ENABLED=true`. Customers see a suggestion only when a
 * published pack exists for their sector; drafts stay with Caudals staff and
 * experts whatever the flag says.
 */
export function sectorPacksEnabled(env: Record<string, string | undefined> = process.env) {
  return env.SECTOR_PACKS_ENABLED === "true";
}

/** A published version needs at least this many expert-approved questions (spec P-30). */
export const SECTOR_PACK_MIN_PUBLISHED_ITEMS = 60;
/** About 25 new questions a month per subscribed workspace (spec P-26). */
export const MONTHLY_PROPOSALS_PER_WORKSPACE = 25;
/** Proposals drafted from one source's changed pages in one month. */
export const MONTHLY_PROPOSALS_PER_SOURCE = 12;
/** Website sources re-read per workspace and month. */
export const MONTHLY_SOURCES_PER_WORKSPACE = 10;
/** A source whose freshness date is older than this is shown as due for a check. */
export const SOURCE_FRESHNESS_DAYS = 180;
