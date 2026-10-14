import type { PoolClient } from "pg";
import { partnerEnabled, partnersMode, type PartnersMode } from "./flags";

/** A partner a signed-in person belongs to (launch L-28), as identity.ts exposes it. */
export type PartnerScope = { id: string; name: string; role: "admin" | "member" };

/**
 * The person's active partners whose surfaces are on (PARTNERS_ENABLED). Read
 * under RLS (own partner rows only); nothing is read while the flag is off.
 * Every partner route re-checks membership in the database.
 */
export async function partnerScopes(db: PoolClient, userId: string, mode: PartnersMode = partnersMode()): Promise<PartnerScope[]> {
  if (!mode.admin) return [];
  const rows = (await db.query<PartnerScope>(`SELECT p.id, p.name, m.role FROM evals.partner_member m JOIN evals.partner p ON p.id = m.partner_id
    WHERE m.user_id = $1 AND p.status = 'active' ORDER BY p.name, p.id LIMIT 20`, [userId])).rows;
  return rows.filter((row) => partnerEnabled(mode, row.id));
}
