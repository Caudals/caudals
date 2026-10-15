/**
 * Server handlers for the customer billing screens (launch L-15, spec v2
 * §6.12, §6.16): GET /api/evals/v1/billing/{summary,usage,ledger,caps} and
 * PUT /caps. Roles are checked here, server-side, and every route answers 404
 * where billing does not show (lib/billing/billing-ui.ts), except GET /summary,
 * which answers `null` to an owner or editor there (the shell's probe):
 *
 *   summary  owner, editor (operators read as editors; platform admins read)
 *   usage    owner, editor (JSON or CSV)
 *   ledger   owner
 *   caps     GET owner, editor · PUT owner, with an Idempotency-Key
 *   rates    owner, editor: credit rates of the models a run would use
 *
 * Viewers get 404 everywhere. Every amount is µcr as a string, derived from
 * the ledger (lib/billing/account-view.ts); the screens format it.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import {
  everFunded, ledgerPage, lowBalanceThreshold, lowBalanceThresholdUcr, monthWindow, nextExpiry, readAccount, usageLines, usageReport, usageTotals, type UsageLine,
} from "./account-view";
import { allowanceKey, allowancePeriod } from "./allowance";
import { billingLevel, billingUiEligible, type BillingLevel } from "./billing-ui";
import { engineBillingMode, workspaceEngineMode } from "./engine";
import { EstimateError, evaluationModelRates } from "./estimate";
import { capsInput, readSpendCaps, saveLowBalanceThreshold, saveSpendCaps, type SpendCaps } from "./limits";
import { plansV2For } from "./overrides";
import { findPack, packCredits } from "./packs";
import { getAutoRecharge, getStripeCustomer } from "./payments";
import { paymentsAccessFor, stripeMode } from "./payments-config";
import { MONTHLY_ALLOWANCE_CREDITS } from "./plans";
import { UCR_PER_CREDIT, ucrToCredits } from "./units";

type Env = Record<string, string | undefined>;
const ZERO = BigInt(0);
const s = (value: bigint) => value.toString();

/* -------------------------------------------------------------- access --- */

export interface BillingReader { level: BillingLevel; role: string | null; admin: boolean }

/**
 * Billing does not show in this workspace (flag off, or the workspace is not
 * eligible) for someone who would otherwise read it. Still a 404 everywhere
 * but GET /summary, which answers `null` to such a member instead (R3): the
 * shell asks on every page, and a 404 there was console noise for every
 * customer without billing.
 */
export class BillingNotShown extends EvalError {
  constructor() { super("SCOPE_DENIED", 404); this.name = "BillingNotShown"; }
}

/**
 * The person's billing level in the workspace, or 404: viewers, outsiders,
 * and every workspace where billing does not show. `need: "owner"` also
 * refuses editors.
 */
export async function requireBillingReader(identity: EvalIdentity, orgId: string, need: BillingLevel = "editor", env: Env = process.env): Promise<BillingReader> {
  if (!z.uuid().safeParse(orgId).success) throw new EvalError("SCOPE_DENIED", 404);
  const role = identity.workspaces.find(workspace => workspace.id === orgId)?.role ?? null;
  const admin = identity.platformRole === "platform_admin";
  const level = billingLevel(role, admin);
  if (!level || (need === "owner" && level !== "owner")) throw new EvalError("SCOPE_DENIED", 404);
  await requireWorkspace(identity, orgId, "read");
  if (!(await withTenant({ orgId, actorId: identity.user.id }, db => billingUiEligible(db, orgId, env)))) throw new BillingNotShown();
  return { level, role, admin };
}

/* ------------------------------------------------------------- summary --- */

function capsView(caps: SpendCaps) {
  return { monthlyUcr: caps.monthlyUcr === null ? null : s(caps.monthlyUcr), perRunUcr: caps.perRunUcr === null ? null : s(caps.perRunUcr), perRunMultiplier: caps.perRunMultiplier };
}

/**
 * GET /summary: balance, plan, usage this month against the cap, alerts and
 * the next expiry for owners and editors; auto-recharge, the saved card and
 * payments for owners. `null` for an owner or editor of a workspace where
 * billing does not show; 404 for viewers and outsiders.
 */
export async function billingSummary(identity: EvalIdentity, orgId: string, env: Env = process.env) {
  let reader: BillingReader;
  try {
    reader = await requireBillingReader(identity, orgId, "editor", env);
  } catch (error) {
    if (error instanceof BillingNotShown) return null;
    throw error;
  }
  const owner = reader.level === "owner";
  const window = monthWindow();
  const data = await withTenant({ orgId, actorId: identity.user.id }, async db => {
    const account = await readAccount(db, orgId);
    if (!account) return null;
    const entitlement = (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0];
    const [month, caps, threshold, expiry, mode, allowance] = await Promise.all([
      usageTotals(db, orgId, window.start, window.end),
      readSpendCaps(db, orgId),
      lowBalanceThresholdUcr(db, orgId),
      nextExpiry(db, orgId),
      workspaceEngineMode(db, engineBillingMode(env), orgId),
      db.query("SELECT l.expires_at FROM billing.ledger_entry e JOIN billing.credit_lot l ON l.org_id=e.org_id AND l.id=(e.lot_allocations->0->>'lot')::uuid WHERE e.org_id=$1 AND e.idempotency_key=$2",
        [orgId, `grant:${allowanceKey(allowancePeriod())}`]),
    ]);
    const settings = owner ? await getAutoRecharge(db, orgId) : null;
    const customer = owner ? await getStripeCustomer(db, orgId, stripeMode(env) === "live") : null;
    const pending = owner ? Number((await db.query("SELECT count(*)::int AS n FROM billing.top_up_order WHERE org_id=$1 AND status='pending' AND created_at > now()-interval '1 hour'", [orgId])).rows[0].n) : 0;
    // A workspace that never had credits is not "low"; the monthly allowance exists only where plans v2 applies (L-14).
    const funded = await everFunded(db, orgId);
    const plansV2 = await plansV2For(db, orgId, env);
    return { account, plan: String(entitlement?.plan ?? "managed"), month, caps, threshold, expiry, mode, allowance: allowance.rows[0] ?? null, settings, customer, pending, funded, plansV2 };
  });
  if (!data) return null;
  const { account, month, caps, threshold, expiry, settings } = data;
  const committed = month.netUcr + account.heldUcr;
  const payments = owner ? await paymentsAccessFor(orgId, env, { actorId: identity.user.id }) : "closed";
  const credit = account.billingMode !== "contract";
  const alerts: Array<{ kind: string; [key: string]: unknown }> = [];
  if (account.frozen) alerts.push({ kind: "frozen" });
  const low = credit && data.funded && account.availableUcr < threshold;
  if (low) alerts.push({ kind: "low_balance", thresholdUcr: s(threshold) });
  if (caps.monthlyUcr !== null && caps.monthlyUcr > ZERO && committed * BigInt(100) >= caps.monthlyUcr * BigInt(50)) {
    alerts.push({ kind: "cap", percent: Number((committed * BigInt(100)) / caps.monthlyUcr) });
  }
  if (owner && settings?.enabled && (settings.failures > 0 || settings.disabledReason)) alerts.push({ kind: "auto_recharge_failing", code: settings.lastFailureCode });
  if (owner && settings && !settings.enabled && settings.disabledReason === "payment_failed") alerts.push({ kind: "auto_recharge_off" });
  if (expiry && expiry.source !== "allowance" && expiry.at.getTime() - Date.now() < 30 * 86_400_000) alerts.push({ kind: "expiring", ucr: s(expiry.ucr), at: expiry.at.toISOString() });
  const pack = settings ? findPack(settings.packCents) : null;
  return {
    orgId, level: reader.level, role: reader.role, plan: data.plan, billingMode: account.billingMode,
    balance: { availableUcr: s(account.availableUcr), heldUcr: s(account.heldUcr) },
    frozen: account.frozen,
    // Whether a run needs credits now (§6.7 gate): enforced for this workspace and not on a contract.
    gate: data.mode === "enforce" && credit ? "enforced" : "none",
    month: { period: window.period, from: window.start.toISOString(), to: window.end.toISOString(), usedUcr: s(month.netUcr), committedUcr: s(committed) },
    caps: capsView(caps),
    lowBalance: { thresholdUcr: s(threshold), below: low },
    allowance: data.plansV2 && (data.plan === "free" || data.plan === "payg")
      ? { monthlyCredits: MONTHLY_ALLOWANCE_CREDITS, period: allowancePeriod(), granted: Boolean(data.allowance), expiresAt: data.allowance ? new Date(data.allowance.expires_at).toISOString() : null }
      : null,
    nextExpiry: expiry ? { ucr: s(expiry.ucr), at: expiry.at.toISOString(), source: expiry.source } : null,
    alerts,
    autoRecharge: owner ? {
      enabled: Boolean(settings?.enabled), thresholdUcr: settings ? s(settings.thresholdUcr) : null, pack: pack?.id ?? null,
      packCredits: pack ? Number(packCredits(pack, false).totalUcr / UCR_PER_CREDIT) : null,
      monthlyMaxCount: settings?.monthlyMaxCount ?? null, monthlyMaxCents: settings?.monthlyMaxCents ?? null,
      failures: settings?.failures ?? 0, disabledReason: settings?.disabledReason ?? null, lastFailureCode: settings?.lastFailureCode ?? null,
    } : null,
    card: owner && data.customer?.paymentMethodId ? { brand: data.customer.cardBrand, last4: data.customer.cardLast4 } : null,
    payments: owner ? { access: payments, mode: stripeMode(env), pendingOrders: data.pending } : null,
    asOf: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------- usage --- */

const MAX_RANGE_DAYS = 400;
export const usageQuery = z.object({
  orgId: z.uuid(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/** [from, to) in UTC days; default: the current month. `to` is inclusive as a date. */
export function usageRange(input: { from?: string; to?: string }, now = new Date()) {
  const month = monthWindow(now);
  const from = input.from ? new Date(`${input.from}T00:00:00Z`) : month.start;
  const to = input.to ? new Date(new Date(`${input.to}T00:00:00Z`).getTime() + 86_400_000) : month.end;
  if (!(to > from) || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new EvalError("INPUT_INVALID", 422, "Choose a date range of up to 400 days.");
  return { from, to };
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function usageCsv(lines: UsageLine[]) {
  const header = ["date_utc", "entry_id", "evaluation", "evaluation_id", "run_id", "kind", "model_or_meter", "quantity", "tokens", "charged_credits", "refunded_credits", "net_credits", "net_eur_excl_vat"];
  const rows = lines.map(line => [
    line.createdAt.toISOString(), line.id, line.evaluationTitle ?? "", line.evaluationId ?? "", line.runId ?? "", line.kind, line.key,
    line.quantity ?? "", line.tokens ?? "", ucrToCredits(line.grossUcr), ucrToCredits(line.returnedUcr), ucrToCredits(line.netUcr),
    // 1 credit = €0.01 excl. VAT, exactly.
    ucrToCredits(line.netUcr / BigInt(100)),
  ]);
  return `${[header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** GET /usage: by day, by evaluation and run, by model and meter; or every entry as CSV. */
export async function billingUsage(identity: EvalIdentity, params: URLSearchParams, env: Env = process.env) {
  const input = usageQuery.parse(Object.fromEntries(params));
  await requireBillingReader(identity, input.orgId, "editor", env);
  const range = usageRange(input);
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  if (input.format === "csv") {
    const lines = await withTenant(scope, db => usageLines(db, input.orgId, range.from, range.to));
    const name = `caudals-usage-${range.from.toISOString().slice(0, 10)}-${new Date(range.to.getTime() - 86_400_000).toISOString().slice(0, 10)}.csv`;
    return new Response(usageCsv(lines), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  }
  const report = await withTenant(scope, db => usageReport(db, input.orgId, range.from, range.to));
  return {
    from: report.from.toISOString(), to: report.to.toISOString(),
    totals: { grossUcr: s(report.totals.grossUcr), returnedUcr: s(report.totals.returnedUcr), netUcr: s(report.totals.netUcr) },
    days: report.days.map(day => ({ day: day.day, netUcr: s(day.netUcr) })),
    runs: report.runs.map(run => ({ ...run, netUcr: s(run.netUcr), grossUcr: s(run.grossUcr), returnedUcr: s(run.returnedUcr), runStartedAt: run.runStartedAt?.toISOString() ?? null })),
    items: report.items.map(item => ({ ...item, netUcr: s(item.netUcr), grossUcr: s(item.grossUcr), returnedUcr: s(item.returnedUcr) })),
  };
}

/* -------------------------------------------------------------- ledger --- */

export const ledgerQuery = z.object({ orgId: z.uuid(), cursor: z.string().regex(/^\d{1,18}$/).optional(), holds: z.enum(["0", "1"]).optional(), limit: z.coerce.number().int().min(1).max(200).optional() });

/** GET /ledger?cursor=: the workspace's entries, newest first (owners). */
export async function billingLedger(identity: EvalIdentity, params: URLSearchParams, env: Env = process.env) {
  const input = ledgerQuery.parse(Object.fromEntries(params));
  await requireBillingReader(identity, input.orgId, "owner", env);
  const page = await withTenant({ orgId: input.orgId, actorId: identity.user.id }, db =>
    ledgerPage(db, input.orgId, { before: input.cursor ? BigInt(input.cursor) : null, limit: input.limit, holds: input.holds === "1" }));
  return {
    entries: page.entries.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString(), amountUcr: s(entry.amountUcr), availableAfterUcr: s(entry.availableAfterUcr), heldAfterUcr: s(entry.heldAfterUcr) })),
    nextCursor: page.nextCursor,
  };
}

/* ---------------------------------------------------------------- caps --- */

/** The low-balance threshold in use, the owner's own (null: the default rule) and the default. */
function thresholdView(threshold: Awaited<ReturnType<typeof lowBalanceThreshold>>) {
  return { lowBalanceThresholdUcr: s(threshold.thresholdUcr), lowBalanceCustomUcr: threshold.customUcr === null ? null : s(threshold.customUcr), lowBalanceDefaultUcr: s(threshold.defaultUcr) };
}

/** GET /caps: the caps, the low-balance threshold and who gets billing alerts (recipients for owners). */
export async function billingCaps(identity: EvalIdentity, orgId: string, env: Env = process.env) {
  const reader = await requireBillingReader(identity, orgId, "editor", env);
  return withTenant({ orgId, actorId: identity.user.id }, async db => {
    const caps = await readSpendCaps(db, orgId);
    const threshold = await lowBalanceThreshold(db, orgId);
    const recipients = reader.level === "owner"
      ? (await db.query<{ email: string }>("SELECT email FROM evals.notification_email_recipients($1,'low_balance') ORDER BY email", [orgId])).rows.map(row => row.email)
      : null;
    return { ...capsView(caps), updatedAt: caps.updatedAt?.toISOString() ?? null, ...thresholdView(threshold), recipients };
  });
}

/**
 * PUT /caps (owners): the monthly cap, the per-run cap and, when given, the
 * low-balance threshold (null: back to the default). Audited by
 * billing.set_spend_cap and billing.set_low_balance_threshold.
 */
export async function saveBillingCaps(request: Request, identity: EvalIdentity, body: unknown, env: Env = process.env) {
  const input = capsInput.parse(body);
  const reader = await requireBillingReader(identity, input.orgId, "owner", env);
  // Platform admins read for support but do not change a customer's limits here.
  if (reader.role !== "owner") throw new EvalError("SCOPE_DENIED", 404);
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new EvalError("INPUT_INVALID", 400, "Idempotency-Key required.");
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  return withTenant(scope, db => idempotent(db, scope, "billing-caps", key, input, async () => {
    const caps = await saveSpendCaps(db, input, requestId);
    if (input.lowBalanceThresholdCredits !== undefined) await saveLowBalanceThreshold(db, input.orgId, input.lowBalanceThresholdCredits, requestId);
    return { ...capsView(caps), updatedAt: caps.updatedAt?.toISOString() ?? null, ...thresholdView(await lowBalanceThreshold(db, input.orgId)) };
  }));
}

/* --------------------------------------------------------------- rates --- */

/** GET /rates?orgId=&evaluationId=: the models an evaluation's runs use with their credit rates, and the price list. */
export async function billingRates(identity: EvalIdentity, params: URLSearchParams, env: Env = process.env) {
  const input = z.object({ orgId: z.uuid(), evaluationId: z.uuid().optional() }).parse(Object.fromEntries(params));
  await requireBillingReader(identity, input.orgId, "editor", env);
  return withTenant({ orgId: input.orgId, actorId: identity.user.id }, db => evaluationModelRates(db, input.orgId, input.evaluationId ?? null))
    .catch(error => {
      if (error instanceof EstimateError) throw new EvalError(error.code === "SCOPE_DENIED" ? "SCOPE_DENIED" : "SERVICE_UNAVAILABLE", error.code === "SCOPE_DENIED" ? 404 : 503);
      throw error;
    });
}
