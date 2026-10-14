/**
 * PARTNERS_ENABLED (launch L-28), read on the server on every request and
 * passed to client components as a prop. Default off.
 *
 * - `true`: partner accounts on for every partner ops have onboarded by hand.
 * - a comma-separated list of partner ids: only those partners see their
 *   dashboard, API and PDF logo (the per-partner gate for the first rollout).
 * - `admins` (alone or in the list): the ops API for platform admins, so the
 *   first partner can be created before its id is listed.
 * - anything else: off; every partner page and route answers 404.
 *
 * The ops API is open to platform admins whenever the value is not off.
 */
export type PartnersMode = { readonly admin: boolean; readonly all: boolean; readonly partnerIds: ReadonlySet<string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PARTNERS_OFF: PartnersMode = { admin: false, all: false, partnerIds: new Set() };

export function partnersMode(env: Record<string, string | undefined> = process.env): PartnersMode {
  const tokens = (env.PARTNERS_ENABLED ?? "").split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.includes("true")) return { admin: true, all: true, partnerIds: new Set() };
  const partnerIds = new Set(tokens.filter((token) => UUID.test(token)));
  const admin = tokens.includes("admins") || partnerIds.size > 0;
  return admin ? { admin, all: false, partnerIds } : PARTNERS_OFF;
}

/** Whether a partner's own surfaces (dashboard, API, PDF logo) are on. */
export function partnerEnabled(mode: PartnersMode, partnerId: string): boolean {
  return mode.all || mode.partnerIds.has(partnerId.toLowerCase());
}
