/**
 * Manual tax review of billing profiles (launch G2, the L-12 follow-up; spec
 * v2 §6.13, §6.14). A profile waits for a person when VIES could not confirm
 * an EU VAT number, or when a Spanish address is in the Canary Islands, Ceuta
 * or Melilla (outside the IVA territory). Until then the workspace cannot buy
 * credits: refused purchases are recorded for the queue
 * (billing.record_blocked_top_up, called by lib/billing/top-ups.ts).
 *
 * The ops console lists those profiles with the purchases refused meanwhile
 * and their open orders (GET /admin/tax-reviews), and a platform admin with a
 * recent sign-in sets the treatment after the review (POST
 * /admin/tax-reviews/:orgId) within the §6.14 rules the database enforces
 * (billing.resolve_tax_review, migration 112):
 *
 * | Review                         | Allowed                                                         |
 * | Canary Islands, Ceuta, Melilla | not subject (established there; IGIC or IPSI), or 21 % IVA      |
 * |                                | (the establishment receiving the service is in the IVA territory) |
 * | VIES unavailable               | reverse charge with the VIES consultation number the reviewer   |
 * |                                | got, or 21 % IVA (no valid VIES number)                          |
 *
 * The buyer then completes Checkout with that treatment; saving the billing
 * details again re-decides it (and a special territory goes back to review).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import type { TaxReviewReason, TaxTreatment } from "./tax";

/** The treatments a review may set, by its reason (§6.14; the database enforces the same). */
export const REVIEW_TREATMENTS: Readonly<Record<TaxReviewReason, readonly TaxTreatment[]>> = Object.freeze({
  es_special_territory: ["non_eu_not_subject", "es_vat"],
  vies_unavailable: ["eu_reverse_charge", "es_vat"],
});

/** Whether a treatment is allowed for a review, and whether it needs a VIES consultation number. */
export function reviewTreatmentAllowed(reason: TaxReviewReason, treatment: TaxTreatment, viesConsultation: string | null): boolean {
  if (!REVIEW_TREATMENTS[reason]?.includes(treatment)) return false;
  if (treatment === "eu_reverse_charge") return Boolean(viesConsultation?.trim());
  return !viesConsultation?.trim();
}

type Row = Record<string, unknown>;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());

export interface TaxReview {
  orgId: string; workspace: string; legalName: string; country: string; taxId: string; taxIdKind: string; viesStatus: string;
  viesCheckedAt: string | null; reviewReason: TaxReviewReason; postalCode: string; city: string; region: string | null; billingEmail: string;
  version: number; since: string; allowed: readonly TaxTreatment[];
  blocked: Array<{ source: "checkout" | "auto_recharge"; netCents: number | null; at: string }>;
  openOrders: Array<{ orderId: string; kind: string; netCents: number; taxTreatment: string; createdAt: string }>;
}

/** GET /admin/tax-reviews: the profiles waiting for review, oldest first. Platform admins. */
export async function taxReviewsForAdmin(identity: EvalIdentity) {
  requirePlatformAdmin(identity);
  const rows = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT billing.tax_review_queue() AS q")).rows[0].q as Row[]).catch(taxReviewError);
  return {
    reviews: rows.map((row): TaxReview => {
      const reason = String(row.review_reason) as TaxReviewReason;
      return {
        orgId: String(row.org_id), workspace: String(row.workspace), legalName: String(row.legal_name), country: String(row.country), taxId: String(row.tax_id),
        taxIdKind: String(row.tax_id_kind), viesStatus: String(row.vies_status), viesCheckedAt: iso(row.vies_checked_at), reviewReason: reason,
        postalCode: String(row.postal_code), city: String(row.city), region: str(row.region), billingEmail: String(row.billing_email),
        version: Number(row.version), since: iso(row.since)!, allowed: REVIEW_TREATMENTS[reason] ?? [],
        blocked: ((row.blocked ?? []) as Row[]).map(item => ({ source: item.source === "auto_recharge" ? "auto_recharge" : "checkout",
          netCents: item.net_cents === null || item.net_cents === undefined ? null : Number(item.net_cents), at: iso(item.at)! })),
        openOrders: ((row.open_orders ?? []) as Row[]).map(item => ({ orderId: String(item.order_id), kind: String(item.kind), netCents: Number(item.net_cents),
          taxTreatment: String(item.tax_treatment), createdAt: iso(item.created_at)! })),
      };
    }),
  };
}

const MESSAGES: Record<string, [number, string]> = {
  TAX_REVIEW_NOT_PENDING: [409, "These billing details no longer wait for a review."],
  TAX_REVIEW_CHANGED: [409, "The billing details changed after you opened them. Reload and review them again."],
  TAX_TREATMENT_NOT_ALLOWED: [422, "That treatment does not apply to this review. A reverse charge needs the VIES consultation number."],
  BILLING_PROFILE_REQUIRED: [404, "This workspace has no billing details."],
  REASON_REQUIRED: [422, "Give a reason of 3 to 2,000 characters."],
  INPUT_INVALID: [422, "Check the supplied fields."],
  ACCOUNT_MISSING: [404, "This workspace has no credit account."],
};

function taxReviewError(error: unknown): never {
  if (error instanceof EvalError) throw error;
  const code = error instanceof Error ? error.message : "";
  if (code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 403, "A platform administrator is required.");
  const known = MESSAGES[code];
  if (known) throw new EvalError(code, known[0], known[1]);
  throw error;
}

export const resolveInput = z.strictObject({
  version: z.number().int().positive(),
  treatment: z.enum(["es_vat", "eu_reverse_charge", "non_eu_not_subject"]),
  viesConsultation: z.string().trim().max(100).nullish(),
  reason: z.string().trim().min(3).max(2000),
});

/**
 * POST /admin/tax-reviews/:orgId: sets the treatment of a profile waiting for
 * review. Platform admins with a sign-in within 15 minutes; Idempotency-Key;
 * audited in the database with before and after values.
 */
export async function resolveTaxReviewForAdmin(request: Request, identity: EvalIdentity, orgId: string, body: unknown) {
  requireRecentAuthentication(identity);
  const id = z.uuid().parse(orgId);
  const input = resolveInput.parse(body);
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "An Idempotency-Key header is required.");
  await requireWorkspace(identity, id, "read");
  const scope = { orgId: id, actorId: identity.user.id };
  return withTenant(scope, db => idempotent(db, scope, "billing-admin-tax-review", key, { orgId: id, ...input }, async () => {
    const row = (await db.query("SELECT * FROM billing.resolve_tax_review($1,$2::bigint,$3,$4,$5,$6)",
      [id, input.version, input.treatment, input.viesConsultation || null, input.reason, randomUUID()])).rows[0];
    return { orgId: id, taxTreatment: String(row.tax_treatment), viesStatus: String(row.vies_status), version: Number(row.version) };
  })).catch(taxReviewError);
}
