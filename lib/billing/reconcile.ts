/**
 * Daily billing reconciliation (launch spec v2 §6.1 principle 4, §6.13,
 * P-49; L-16). Money lives in Stripe, credits in the ledger and invoices in
 * the invoicing service; once a day they are compared for one UTC day:
 *
 * - Stripe balance transactions ↔ top_up_order: every payment and refund of
 *   the day appears in Stripe with the order's gross amount (reusing the
 *   accountant export's matcher). A Stripe payment we did not match is looked
 *   up by its PaymentIntent (Checkout metadata names the order): a payment
 *   whose order never got its credits is a discrepancy; one that settled on
 *   another day, or that is not ours (another integration on the account), is
 *   an explained note.
 * - top_up_order ↔ ledger purchases, refunds and chargebacks, invoices and
 *   rectifying invoices against the orders, open holds older than 25 hours,
 *   the §6.9 account invariants and the shadow diff
 *   (billing.reconciliation_checks, migration 094).
 *
 * The result is stored in billing.reconciliation_report (append-only). Any
 * unexplained difference opens the `billing_reconciliation` alert
 * (scripts/evals/health-alerts.sh, runbook 23). Gate B needs three
 * consecutive clean days.
 */
import type { Pool } from "pg";
import type Stripe from "stripe";
import { balanceTransactions, reconcileStripe, type BalanceTransaction, type ExportOrder } from "./invoicing/export";
import { withTenant } from "../evals/repositories/db";

const HOUR = 3_600_000;
/** The scheduler reconciles the previous UTC day at start and in the 05:00 UTC hour. */
export const RECONCILE_UTC_HOUR = 5;
export function reconciliationDue(lastRunAt: number, now = new Date()): boolean {
  return lastRunAt === 0 || (now.getUTCHours() === RECONCILE_UTC_HOUR && now.getTime() - lastRunAt > HOUR);
}

export interface CheckResult { count: number; ids: string[]; details?: unknown }
export interface DbChecks {
  day: string; livemode: boolean; from: string; to: string;
  checks: Record<string, CheckResult>;
  notes: Record<string, number>;
  orders: Array<{ id: string; org_id: string; status: string; paid_at: string | null; refunded_at: string | null; gross_cents: number; net_cents: number;
    charge: string | null; refund: string | null; payment_intent: string | null }>;
  totals: Record<string, number | string>;
}

/** Orders found for unmatched Stripe movements (billing.orders_lookup). */
export interface OrderLookup { id: string; orgId: string; status: string; livemode: boolean; paidAt: string | null; refundedAt: string | null; paymentIntent: string | null }

export interface StripeSide {
  checked: boolean;
  /** Why Stripe was not checked (no key for the mode, an API failure). */
  reason?: string;
  matched: number;
  /** Order movements of the day missing in Stripe or with another amount. */
  issues: Array<{ orderId: string; movement: string; status: string; expectedCents: number; stripeAmountCents: number | null; stripeId: string | null }>;
  /** Stripe payments whose order exists but never got its credits. */
  unpaidOrders: Array<{ stripeId: string; orderId: string; status: string }>;
  /** Explained: settled on another UTC day, or not a Caudals order. */
  timing: Array<{ stripeId: string; orderId: string }>;
  unrelated: Array<{ stripeId: string; type: string; amount: number }>;
  totals?: Record<string, number>;
}

export interface ReconciliationReport {
  day: string; livemode: boolean; generatedAt: string;
  discrepancies: number; explained: number; stripeChecked: boolean;
  checks: Record<string, CheckResult>;
  stripe: StripeSide;
  notes: Record<string, number>;
  totals: Record<string, number | string>;
}

/** Compares the day's orders with Stripe. `lookup` resolves unmatched movements to orders. */
export async function stripeSide(db: DbChecks, transactions: BalanceTransaction[],
  lookup: (orderIds: string[], paymentIntents: string[]) => Promise<OrderLookup[]>,
  intentOrders: (paymentIntents: string[]) => Promise<Map<string, string>> = async () => new Map()): Promise<StripeSide> {
  const from = Date.parse(db.from), to = Date.parse(db.to);
  const matched = reconcileStripe({ orders: db.orders as unknown as ExportOrder[], from: db.from, to: db.to }, transactions);
  const created = new Map(transactions.map(tx => [tx.id, tx]));
  const inDay = (id: string) => { const tx = created.get(id); return !!tx && tx.created * 1000 >= from && tx.created * 1000 < to; };
  const unmatched = matched.unmatched.filter(tx => inDay(tx.id));
  const intents = [...new Set(unmatched.map(tx => created.get(tx.id)?.paymentIntentId).filter((value): value is string => !!value))];
  // Checkout puts the order id in the PaymentIntent's metadata; ask Stripe only for intents we do not know.
  const byIntentMetadata = intents.length ? await intentOrders(intents) : new Map<string, string>();
  const orders = intents.length ? await lookup([...new Set(byIntentMetadata.values())], intents) : [];
  const side: StripeSide = {
    checked: true, matched: matched.rows.filter(row => row.status === "matched").length,
    issues: matched.rows.filter(row => row.status !== "matched").map(row => ({ orderId: row.orderId, movement: row.movement, status: row.status,
      expectedCents: row.expectedCents, stripeAmountCents: row.stripeAmountCents, stripeId: row.stripeId })),
    unpaidOrders: [], timing: [], unrelated: [], totals: matched.totals,
  };
  for (const item of unmatched) {
    const intent = created.get(item.id)?.paymentIntentId ?? null;
    const orderId = intent ? byIntentMetadata.get(intent) ?? null : null;
    const order = orders.find(row => (intent && row.paymentIntent === intent) || (orderId && row.id === orderId));
    if (!order || order.livemode !== db.livemode) { side.unrelated.push({ stripeId: item.id, type: item.type, amount: item.amount }); continue; }
    const payment = item.amount > 0;
    const settled = payment ? order.paidAt !== null && ["paid", "refund_pending", "refunded", "disputed", "charged_back"].includes(order.status)
      : order.refundedAt !== null || order.status === "refund_pending";
    if (settled) side.timing.push({ stripeId: item.id, orderId: order.id });
    else side.unpaidOrders.push({ stripeId: item.id, orderId: order.id, status: order.status });
  }
  return side;
}

/** Builds the stored report: every check with a count is a discrepancy; notes and Stripe timing/unrelated are explained. */
export function buildReport(db: DbChecks, stripe: StripeSide, now = new Date()): ReconciliationReport {
  const dbCount = Object.values(db.checks).reduce((total, check) => total + Number(check.count || 0), 0);
  const stripeCount = stripe.checked ? stripe.issues.length + stripe.unpaidOrders.length : 1;
  const explained = Object.values(db.notes).reduce((total, value) => total + Number(value || 0), 0) + stripe.timing.length + stripe.unrelated.length;
  return {
    day: db.day, livemode: db.livemode, generatedAt: now.toISOString(),
    discrepancies: dbCount + stripeCount, explained, stripeChecked: stripe.checked,
    checks: db.checks, stripe, notes: db.notes, totals: db.totals,
  };
}

export interface ReconcileDeps {
  pool?: Pool;
  /** The Stripe client of the report's mode, or null when no key is configured. */
  stripe?: Stripe | null;
  /** Overrides for tests. */
  listTransactions?: (from: string, to: string) => Promise<BalanceTransaction[]>;
  intentOrders?: (paymentIntents: string[]) => Promise<Map<string, string>>;
  now?: Date;
}

/** Order ids from Checkout metadata of PaymentIntents (at most 20 lookups a day). */
export async function stripeIntentOrders(stripe: Stripe, paymentIntents: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of paymentIntents.slice(0, 20)) {
    const intent = await stripe.paymentIntents.retrieve(id);
    const orderId = intent.metadata?.order_id;
    if (orderId && /^[0-9a-f-]{36}$/.test(orderId)) out.set(id, orderId);
  }
  return out;
}

/** Runs the reconciliation for one UTC day and mode and stores it. Service identities and platform admins. */
export async function runReconciliation(actorId: string, day: string, livemode: boolean, deps: ReconcileDeps = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("INPUT_INVALID");
  const scope = { orgId: "", actorId };
  const db = await withTenant(scope, async client =>
    (await client.query("SELECT billing.reconciliation_checks($1::date,$2) AS r", [day, livemode])).rows[0].r as DbChecks, deps.pool);
  let stripe: StripeSide;
  const list = deps.listTransactions ?? (deps.stripe ? (from: string, to: string) => balanceTransactions(deps.stripe!, from, to) : null);
  if (!list) {
    stripe = { checked: false, reason: "stripe_unavailable", matched: 0, issues: [], unpaidOrders: [], timing: [], unrelated: [] };
  } else {
    try {
      // An hour either side, so a payment near midnight still finds its balance transaction.
      const transactions = await list(new Date(Date.parse(db.from) - HOUR).toISOString(), new Date(Date.parse(db.to) + HOUR).toISOString());
      stripe = await stripeSide(db, transactions,
        (orderIds, intents) => withTenant(scope, async client => (await client.query("SELECT * FROM billing.orders_lookup($1::uuid[],$2::text[])", [orderIds, intents])).rows
          .map(row => ({ id: String(row.id), orgId: String(row.org_id), status: String(row.status), livemode: Boolean(row.livemode),
            paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null, refundedAt: row.refunded_at ? new Date(row.refunded_at).toISOString() : null,
            paymentIntent: row.payment_intent ? String(row.payment_intent) : null })), deps.pool),
        deps.intentOrders ?? (deps.stripe ? ids => stripeIntentOrders(deps.stripe!, ids) : undefined));
    } catch {
      stripe = { checked: false, reason: "stripe_failed", matched: 0, issues: [], unpaidOrders: [], timing: [], unrelated: [] };
    }
  }
  const report = buildReport(db, stripe, deps.now);
  const row = await withTenant(scope, async client => (await client.query(
    "SELECT id,generated_at FROM billing.record_reconciliation($1::date,$2,$3,$4,$5,$6::jsonb)",
    [day, livemode, report.discrepancies, report.explained, report.stripeChecked, JSON.stringify(report)])).rows[0], deps.pool);
  return { id: String(row.id), ...report };
}

export interface StoredReport { id: string; day: string; livemode: boolean; generatedAt: string; actorId: string; discrepancies: number; explained: number; stripeChecked: boolean; report: ReconciliationReport | null }

/** Stored reports (newest first), or the latest report of one day. */
export async function storedReports(actorId: string, livemode: boolean, day: string | null, pool?: Pool): Promise<StoredReport[]> {
  return withTenant({ orgId: "", actorId }, async client => (await client.query("SELECT * FROM billing.reconciliation_reports($1,$2::date,60)", [livemode, day])).rows
    .map(row => ({ id: String(row.id), day: String(row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day).slice(0, 10), livemode: Boolean(row.livemode),
      generatedAt: new Date(row.generated_at).toISOString(), actorId: String(row.actor_id), discrepancies: Number(row.discrepancies), explained: Number(row.explained),
      stripeChecked: Boolean(row.stripe_checked), report: (row.report ?? null) as ReconciliationReport | null })), pool);
}

/** Consecutive clean days ending with the latest reconciled day (the latest run of each day counts). Gate B needs 3. */
export function cleanStreak(reports: Array<Pick<StoredReport, "day" | "discrepancies" | "generatedAt">>): { days: number; since: string | null } {
  const latest = new Map<string, Pick<StoredReport, "day" | "discrepancies" | "generatedAt">>();
  for (const report of reports) {
    const seen = latest.get(report.day);
    if (!seen || seen.generatedAt < report.generatedAt) latest.set(report.day, report);
  }
  const days = [...latest.values()].sort((a, b) => b.day.localeCompare(a.day));
  let streak = 0; let since: string | null = null; let expected: string | null = null;
  for (const report of days) {
    if (expected && report.day !== expected) break;
    if (report.discrepancies > 0) break;
    streak++; since = report.day;
    expected = new Date(Date.parse(`${report.day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  return { days: streak, since };
}
