/**
 * Provider-price check acknowledgements (launch G2, the L-10 follow-up; spec
 * v2 §6.4). The weekly check (lib/billing/price-check.ts) stores the rates
 * whose listed price moved or whose cost moved past the 3 % recompute
 * threshold. Until a platform admin acknowledges those findings, with a note
 * of what was decided (a draft revision, or why the book stays), the health
 * check opens `price_check_changes` (scripts/evals/health-alerts.sh, runbook
 * 24). An acknowledgement covers the findings, not just one check: the same
 * findings next week stay acknowledged, anything new alerts again
 * (billing.price_check_status, migration 112).
 */
import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requireRecentAuthentication } from "@/lib/evals/repositories/platform";

export interface PriceCheckStatus {
  checkId: string; checkedAt: string; revisionId: string;
  /** Rates that moved or are due for recomputation; 0 = nothing for ops. */
  alerting: number;
  acknowledgement: { at: string; by: string; note: string; checkId: string } | null;
  /** True while the health check's price_check_changes alert is open. */
  open: boolean;
}

/** The latest weekly check and whether its findings were acknowledged. */
export async function priceCheckStatus(db: PoolClient): Promise<PriceCheckStatus | null> {
  const row = (await db.query("SELECT * FROM billing.price_check_status()")).rows[0];
  if (!row) return null;
  const acknowledgement = row.acknowledged_at
    ? { at: new Date(row.acknowledged_at).toISOString(), by: String(row.acknowledged_by), note: String(row.note), checkId: String(row.acknowledged_check_id) }
    : null;
  const alerting = Number(row.alerting);
  return {
    checkId: String(row.check_id), checkedAt: new Date(row.checked_at).toISOString(), revisionId: String(row.revision_id), alerting, acknowledgement,
    open: alerting > 0 && !acknowledgement,
  };
}

const MESSAGES: Record<string, [number, string]> = {
  PRICE_CHECK_NOT_FOUND: [404, "Price check not found."],
  PRICE_CHECK_SUPERSEDED: [409, "A newer price check exists. Review that one instead."],
  PRICE_CHECK_CLEAN: [409, "This price check found nothing that needs a decision."],
  REASON_REQUIRED: [422, "Give a reason of 3 to 2,000 characters."],
  SCOPE_DENIED: [403, "A platform administrator is required."],
};

export const acknowledgeInput = z.strictObject({ orgId: z.uuid(), note: z.string().trim().min(3).max(2000) });

/**
 * POST /admin/price-book/checks/:id/acknowledge: a platform admin with a
 * recent sign-in acknowledges the latest check's findings with a note.
 * Idempotent per Idempotency-Key and per check; audited in the database.
 */
export async function acknowledgePriceCheckForAdmin(request: Request, identity: EvalIdentity, id: string, body: unknown) {
  requireRecentAuthentication(identity);
  const input = acknowledgeInput.parse(body);
  const checkId = z.uuid().parse(id);
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "An Idempotency-Key header is required.");
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, "price-check-acknowledge", key, { checkId, note: input.note }, async () => {
    const row = (await db.query("SELECT * FROM billing.acknowledge_price_check($1::uuid,$2)", [checkId, input.note])).rows[0];
    return { checkId: String(row.check_id), acknowledgedAt: new Date(row.acknowledged_at).toISOString(), acknowledgedBy: String(row.actor_id), note: String(row.note) };
  })).catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "";
    const known = MESSAGES[code];
    if (known) throw new EvalError(code, known[0], known[1]);
    throw error;
  });
}
