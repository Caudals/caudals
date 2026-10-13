/**
 * Ops billing reports (launch spec v2 §6.13; L-16): the daily
 * reconciliation (stored reports, the clean-day streak for Gate B, a run on
 * demand) and the monthly accountant export screen, which reuses L-13's
 * export (billing.accountant_export, lib/billing/invoicing/export.ts).
 * Platform admins; running a reconciliation needs a recent sign-in.
 */
import "server-only";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { getLegalEntity } from "@/lib/legal/entity";
import { balanceTransactions, reconcileStripe, renderExport, type AccountantExport } from "./invoicing/export";
import { opsApiError, opsIdempotencyKey } from "./ops";
import { stripeMode } from "./payments-config";
import { cleanStreak, runReconciliation, storedReports, type ReconcileDeps } from "./reconcile";
import { getStripe } from "./stripe";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date.");
const mode = z.enum(["test", "live"]);

/** The Stripe client for the configured mode, or null when its key is missing (never a key of the other mode). */
export function stripeOrNull(): ReturnType<typeof getStripe> | null {
  try { return getStripe(); } catch { return null; }
}

/** GET /admin/reconciliation?date=&mode=: the stored reports, one day's report (default: the latest) and the clean-day streak. */
export async function reconciliationForAdmin(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const livemode = mode.parse(params.get("mode") ?? stripeMode()) === "live";
  const date = params.get("date") ? day.parse(params.get("date")) : null;
  try {
    const reports = await storedReports(identity.user.id, livemode, null);
    const target = date ?? reports[0]?.day ?? null;
    const [detail] = target ? await storedReports(identity.user.id, livemode, target) : [];
    return {
      mode: livemode ? "live" : "test", configuredMode: stripeMode(),
      reports: reports.map(({ report: _report, ...row }) => row),
      report: detail ?? null,
      streak: cleanStreak(reports),
    };
  } catch (error) {
    return opsApiError(error);
  }
}

export const runReconciliationInput = z.strictObject({ date: day.optional() });

/** POST /admin/reconciliation {date?}: reconciles a UTC day now (default today so far) in the configured mode and stores it. */
export async function runReconciliationForAdmin(request: Request, identity: EvalIdentity, body: unknown, deps: Omit<ReconcileDeps, "pool"> = {}) {
  requireRecentAuthentication(identity);
  opsIdempotencyKey(request);
  const input = runReconciliationInput.parse(body);
  const today = new Date().toISOString().slice(0, 10);
  const target = input.date ?? today;
  if (target > today) throw new EvalError("INPUT_INVALID", 422, "Choose today or an earlier day.");
  const livemode = stripeMode() === "live";
  return runReconciliation(identity.user.id, target, livemode, { ...deps, stripe: deps.stripe === undefined ? stripeOrNull() : deps.stripe })
    .catch(opsApiError);
}

const EXPORT_FILES = ["summary.md", "sales.csv", "credits.csv", "orders.csv", "documents.csv", "reconciliation.csv"] as const;

/**
 * GET /admin/export?month=YYYY-MM&mode=test|live[&stripe=1][&file=…]: the
 * monthly accountant export (L-13) — a summary, or one file to download.
 * `stripe=1` reconciles it to Stripe's balance transactions when the mode is
 * the configured one. Contains customers' fiscal data: platform admins only.
 */
export async function exportForAdmin(identity: EvalIdentity, params: URLSearchParams) {
  requirePlatformAdmin(identity);
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(params.get("month") ?? new Date().toISOString().slice(0, 7));
  const livemode = mode.parse(params.get("mode") ?? stripeMode()) === "live";
  const file = params.get("file") ? z.enum(EXPORT_FILES).parse(params.get("file")) : null;
  const data = await withTenant({ orgId: "", actorId: identity.user.id }, async db =>
    (await db.query("SELECT billing.accountant_export($1::date,$2) AS e", [`${month}-01`, livemode])).rows[0].e as AccountantExport).catch(opsApiError);
  let reconciliation = null;
  let stripeNote: string | null = null;
  if (params.get("stripe") === "1") {
    const stripe = (livemode ? "live" : "test") === stripeMode() ? stripeOrNull() : null;
    if (!stripe) stripeNote = "stripe_unavailable";
    else {
      try { reconciliation = reconcileStripe(data, await balanceTransactions(stripe, data.from, data.to)); } catch { stripeNote = "stripe_failed"; }
    }
  }
  const files = renderExport(data, { issuer: getLegalEntity(), reconciliation });
  if (file) {
    const content = files[file];
    if (content === undefined) throw new EvalError("NOT_FOUND", 404, "That file is part of the export only when Stripe is reconciled.");
    const name = `caudals-${month}${livemode ? "" : "-test"}-${file}`;
    return new Response(content, { headers: {
      "Content-Type": file.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  }
  return {
    month: data.month, livemode: data.livemode, complete: data.complete, from: data.from, to: data.to, checks: data.checks,
    sales: data.sales, refunds: data.refunds, chargebacks: data.chargebacks.length, purchasedCredits: data.purchased_credits, freeCredits: data.free_credits,
    orders: data.orders.length, documentsToIssue: data.checks.documents_to_issue ?? 0, files: Object.keys(files),
    reconciliation: reconciliation ? { reconciled: reconciliation.reconciled, issues: reconciliation.issues, totals: reconciliation.totals, unmatched: reconciliation.unmatched.length } : null,
    stripeNote,
  };
}
