/**
 * What the customer billing screens show, read from the ledger (launch L-15,
 * spec v2 §6.9, §6.10, §6.12). Every function takes a client inside the
 * caller's transaction scoped to the workspace (RLS by org_id), so a
 * workspace only ever reads its own rows.
 *
 * One rule makes every number match the ledger: usage is the sum of the
 * workspace's debit entries (capture: engine tokens; action: platform meters)
 * minus what later entries gave back for them (a run refund or a reversal
 * points at the entry it returns, `reverses_entry_id`). A debit counts on the
 * day it was written; its refunds reduce that same line. Balances are the
 * account row, which the nightly verifier proves equal to the sum of entries.
 * Amounts stay in µcr (bigint, as strings in JSON); screens format them.
 *
 * No React and no "server-only": the evals scheduler reads usage for caps and
 * alerts.
 */
import type { PoolClient } from "pg";
import type { BillingMode } from "./ledger";
import { UCR_PER_CREDIT } from "./units";

const ZERO = BigInt(0);
const big = (value: unknown) => (value === null || value === undefined ? ZERO : BigInt(String(value)));

/* ------------------------------------------------------------- account --- */

export interface AccountState { billingMode: BillingMode; availableUcr: bigint; heldUcr: bigint; frozen: boolean; version: bigint }

export async function readAccount(db: PoolClient, orgId: string): Promise<AccountState | null> {
  const row = (await db.query("SELECT billing_mode,available_ucr,held_ucr,frozen_reason IS NOT NULL AS frozen,version FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0];
  if (!row) return null;
  return { billingMode: row.billing_mode as BillingMode, availableUcr: big(row.available_ucr), heldUcr: big(row.held_ucr), frozen: Boolean(row.frozen), version: big(row.version) };
}

/** The UTC calendar month that contains `at` (the allowance, caps and usage share it). */
export function monthWindow(at: Date = new Date()): { period: string; start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { period: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, start, end };
}

/* --------------------------------------------------------------- usage --- */

/**
 * One row per debit entry in [from, to): its gross charge, what was given back
 * for it, its net, and what it was for. The model comes from the engine
 * attempt the capture settled; the evaluation from the run or, for test-set
 * preparation, from the generation job of the attempt's workflow.
 */
const LINES = `
  WITH debit AS (
    SELECT e.id, e.created_at, e.entry_type, -e.amount_ucr AS gross_ucr, e.run_id, e.attempt_id, e.meter, e.price_book_revision_id,
      e.metadata
    FROM billing.ledger_entry e
    WHERE e.org_id=$1 AND e.entry_type IN ('capture','action') AND e.created_at >= $2 AND e.created_at < $3
  ), back AS (
    SELECT r.reverses_entry_id AS id, sum(r.amount_ucr) AS returned_ucr
    FROM billing.ledger_entry r JOIN debit d ON d.id = r.reverses_entry_id
    WHERE r.org_id=$1 GROUP BY r.reverses_entry_id
  ), line AS (
    SELECT d.id, d.created_at, d.entry_type, d.gross_ucr, coalesce(b.returned_ucr, 0) AS returned_ucr,
      d.gross_ucr - coalesce(b.returned_ucr, 0) AS net_ucr, d.run_id, d.meter,
      CASE WHEN d.entry_type = 'capture' THEN coalesce(m.model_label, m.model_id, 'model') END AS model,
      coalesce(r.evaluation_id, g.evaluation_id) AS evaluation_id,
      CASE WHEN d.entry_type = 'action' THEN d.metadata->>'quantity' END AS quantity,
      CASE WHEN d.entry_type = 'capture' THEN (coalesce((d.metadata->'usage'->>'input')::bigint, 0) + coalesce((d.metadata->'usage'->>'output')::bigint, 0)) END AS tokens
    FROM debit d
    LEFT JOIN back b ON b.id = d.id
    LEFT JOIN evals.run r ON r.org_id = $1 AND r.id = d.run_id
    LEFT JOIN LATERAL (
      SELECT p.model_id, s.workflow_id,
        (SELECT mr.label FROM billing.model_rate mr
          WHERE mr.revision_id = d.price_book_revision_id AND mr.provider = k.provider AND (mr.model_id = k.model_key OR mr.model_id IS NULL)
          ORDER BY mr.model_id NULLS LAST, mr.min_input_tokens LIMIT 1) AS model_label
      FROM evals.execution_attempt a
      JOIN evals.provider_revision p ON p.id = a.provider_revision_id
      JOIN evals.workflow_step s ON s.org_id = a.org_id AND s.id = a.step_id
      CROSS JOIN LATERAL billing.provider_revision_rate_key(p.id) k
      WHERE d.entry_type = 'capture' AND a.org_id = $1 AND a.id = d.attempt_id
    ) m ON true
    LEFT JOIN evals.generation_job g ON g.org_id = $1 AND g.workflow_id = m.workflow_id AND r.id IS NULL
  )`;

export interface UsageTotals { grossUcr: bigint; returnedUcr: bigint; netUcr: bigint }

/** Net usage in [from, to): the sum of debits minus what was given back for them. */
export async function usageTotals(db: PoolClient, orgId: string, from: Date, to: Date): Promise<UsageTotals> {
  const row = (await db.query(`WITH debit AS (
      SELECT e.id, -e.amount_ucr AS gross_ucr FROM billing.ledger_entry e
      WHERE e.org_id=$1 AND e.entry_type IN ('capture','action') AND e.created_at >= $2 AND e.created_at < $3
    )
    SELECT coalesce(sum(d.gross_ucr), 0) AS gross_ucr,
      coalesce((SELECT sum(r.amount_ucr) FROM billing.ledger_entry r JOIN debit x ON x.id = r.reverses_entry_id WHERE r.org_id=$1), 0) AS returned_ucr
    FROM debit d`, [orgId, from, to])).rows[0];
  const grossUcr = big(row.gross_ucr), returnedUcr = big(row.returned_ucr);
  return { grossUcr, returnedUcr, netUcr: grossUcr - returnedUcr };
}

export interface UsageDay { day: string; netUcr: bigint }
export interface UsageRun {
  key: string; runId: string | null; evaluationId: string | null; evaluationTitle: string | null; runStartedAt: Date | null;
  runStatus: string | null; reportId: string | null; netUcr: bigint; grossUcr: bigint; returnedUcr: bigint; entries: number;
}
export interface UsageItem { kind: "tokens" | "meter"; key: string; netUcr: bigint; grossUcr: bigint; returnedUcr: bigint; quantity: number; tokens: number; entries: number }
export interface UsageReport { from: Date; to: Date; totals: UsageTotals; days: UsageDay[]; runs: UsageRun[]; items: UsageItem[] }

/** Usage in [from, to) by UTC day, by evaluation and run, and by model and meter. Every group sums to the totals. */
export async function usageReport(db: PoolClient, orgId: string, from: Date, to: Date): Promise<UsageReport> {
  const params = [orgId, from, to];
  const [totals, days, runs, items] = await Promise.all([
    usageTotals(db, orgId, from, to),
    db.query(`${LINES} SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, sum(net_ucr) AS net_ucr FROM line GROUP BY 1 ORDER BY 1`, params),
    db.query(`${LINES}, grouped AS (
        SELECT run_id, CASE WHEN run_id IS NULL THEN evaluation_id END AS prep_evaluation_id, max(evaluation_id::text)::uuid AS evaluation_id,
          sum(net_ucr) AS net_ucr, sum(gross_ucr) AS gross_ucr, sum(returned_ucr) AS returned_ucr, count(*) AS entries
        FROM line GROUP BY run_id, CASE WHEN run_id IS NULL THEN evaluation_id END
      )
      SELECT x.*, v.title AS evaluation_title, r.created_at AS run_started_at, r.status AS run_status,
        (SELECT rr.report_id FROM evals.report_revision rr WHERE rr.org_id = $1 AND rr.run_id = x.run_id ORDER BY rr.created_at DESC LIMIT 1) AS report_id
      FROM grouped x
      LEFT JOIN evals.evaluation v ON v.org_id = $1 AND v.id = x.evaluation_id
      LEFT JOIN evals.run r ON r.org_id = $1 AND r.id = x.run_id
      ORDER BY x.net_ucr DESC, r.created_at DESC NULLS LAST`, params),
    db.query(`${LINES} SELECT CASE WHEN entry_type = 'capture' THEN 'tokens' ELSE 'meter' END AS kind,
        CASE WHEN entry_type = 'capture' THEN model ELSE meter END AS key,
        sum(net_ucr) AS net_ucr, sum(gross_ucr) AS gross_ucr, sum(returned_ucr) AS returned_ucr,
        coalesce(sum(quantity::numeric), 0) AS quantity, coalesce(sum(tokens), 0) AS tokens, count(*) AS entries
      FROM line GROUP BY 1, 2 ORDER BY sum(net_ucr) DESC, 2`, params),
  ]);
  return {
    from, to, totals,
    days: days.rows.map(row => ({ day: String(row.day), netUcr: big(row.net_ucr) })),
    runs: runs.rows.map(row => ({
      key: row.run_id ? String(row.run_id) : `prep:${row.prep_evaluation_id ?? "none"}`, runId: row.run_id ? String(row.run_id) : null,
      evaluationId: row.evaluation_id ? String(row.evaluation_id) : null, evaluationTitle: row.evaluation_title ?? null,
      runStartedAt: row.run_started_at ? new Date(row.run_started_at) : null, runStatus: row.run_status ?? null,
      reportId: row.report_id ? String(row.report_id) : null,
      netUcr: big(row.net_ucr), grossUcr: big(row.gross_ucr), returnedUcr: big(row.returned_ucr), entries: Number(row.entries),
    })),
    items: items.rows.map(row => ({
      kind: row.kind === "tokens" ? "tokens" as const : "meter" as const, key: String(row.key ?? "other"),
      netUcr: big(row.net_ucr), grossUcr: big(row.gross_ucr), returnedUcr: big(row.returned_ucr),
      quantity: Number(row.quantity), tokens: Number(row.tokens), entries: Number(row.entries),
    })),
  };
}

export interface UsageLine {
  id: string; createdAt: Date; kind: "tokens" | "meter"; key: string; runId: string | null; evaluationId: string | null; evaluationTitle: string | null;
  quantity: string | null; tokens: number | null; grossUcr: bigint; returnedUcr: bigint; netUcr: bigint;
}

/** Every debit entry in [from, to), newest first (the CSV export); at most `limit` rows. */
export async function usageLines(db: PoolClient, orgId: string, from: Date, to: Date, limit = 20_000): Promise<UsageLine[]> {
  const rows = (await db.query(`${LINES} SELECT l.*, v.title AS evaluation_title FROM line l
      LEFT JOIN evals.evaluation v ON v.org_id = $1 AND v.id = l.evaluation_id
      ORDER BY l.created_at DESC, l.id DESC LIMIT $4`, [orgId, from, to, limit])).rows;
  return rows.map(row => ({
    id: String(row.id), createdAt: new Date(row.created_at), kind: row.entry_type === "capture" ? "tokens" : "meter",
    key: String(row.entry_type === "capture" ? row.model ?? "model" : row.meter ?? "meter"), runId: row.run_id ? String(row.run_id) : null,
    evaluationId: row.evaluation_id ? String(row.evaluation_id) : null, evaluationTitle: row.evaluation_title ?? null,
    quantity: row.quantity ?? null, tokens: row.tokens === null || row.tokens === undefined ? null : Number(row.tokens),
    grossUcr: big(row.gross_ucr), returnedUcr: big(row.returned_ucr), netUcr: big(row.net_ucr),
  }));
}

/** A run's own spend so far: its net captures and charges plus what it holds now (the per-run cap). */
export async function runSpendUcr(db: PoolClient, orgId: string, runId: string): Promise<bigint> {
  const row = (await db.query(`WITH debit AS (
      SELECT e.id, -e.amount_ucr AS gross_ucr FROM billing.ledger_entry e
      WHERE e.org_id=$1 AND e.run_id=$2 AND e.entry_type IN ('capture','action')
    )
    SELECT coalesce((SELECT sum(gross_ucr) FROM debit), 0)
      - coalesce((SELECT sum(r.amount_ucr) FROM billing.ledger_entry r JOIN debit d ON d.id = r.reverses_entry_id WHERE r.org_id=$1), 0)
      + coalesce((SELECT sum(h.amount_ucr) FROM billing.credit_hold h WHERE h.org_id=$1 AND h.run_id=$2 AND h.state = 'held'), 0) AS spend`,
  [orgId, runId])).rows[0];
  return big(row.spend);
}

/* -------------------------------------------------------------- expiry --- */

export interface ExpiringCredits { ucr: bigint; at: Date; source: string; lotId: string }

/** The soonest lots to expire with credit left in them (unheld part), at most `limit`. */
export async function expiringLots(db: PoolClient, orgId: string, before: Date | null = null, limit = 20): Promise<ExpiringCredits[]> {
  const rows = (await db.query(`SELECT id,source,remaining_ucr - held_ucr AS ucr,expires_at FROM billing.credit_lot
    WHERE org_id=$1 AND expires_at IS NOT NULL AND expires_at > now() AND remaining_ucr > held_ucr AND ($2::timestamptz IS NULL OR expires_at <= $2)
    ORDER BY expires_at, created_at, id LIMIT $3`, [orgId, before, limit])).rows;
  return rows.map(row => ({ lotId: String(row.id), source: String(row.source), ucr: big(row.ucr), at: new Date(row.expires_at) }));
}

/** The next expiry: the earliest date any credit expires and how much expires then. */
export async function nextExpiry(db: PoolClient, orgId: string): Promise<ExpiringCredits | null> {
  const row = (await db.query(`WITH soonest AS (
      SELECT min(expires_at) AS at FROM billing.credit_lot
      WHERE org_id=$1 AND expires_at IS NOT NULL AND expires_at > now() AND remaining_ucr > held_ucr
    )
    SELECT s.at, sum(l.remaining_ucr - l.held_ucr) AS ucr, min(l.source) AS source, min(l.id::text) AS lot_id
    FROM soonest s JOIN billing.credit_lot l ON l.org_id=$1 AND l.expires_at = s.at AND l.remaining_ucr > l.held_ucr
    GROUP BY s.at`, [orgId])).rows[0];
  return row?.at ? { at: new Date(row.at), ucr: big(row.ucr), source: String(row.source), lotId: String(row.lot_id) } : null;
}

/* -------------------------------------------------------------- ledger --- */

export interface LedgerRow {
  id: string; createdAt: Date; type: string; amountUcr: bigint; availableAfterUcr: bigint; heldAfterUcr: bigint;
  runId: string | null; meter: string | null; refKind: string | null; reverses: string | null;
}

/**
 * Ledger entries newest first, keyset-paginated on (account_version). Holds
 * and releases (amount 0, they only move credit between available and held)
 * are left out unless asked for. No reasons or actors: ops notes stay in ops.
 */
export async function ledgerPage(db: PoolClient, orgId: string, options: { before?: bigint | null; limit?: number; holds?: boolean } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = (await db.query(`SELECT id,account_version,created_at,entry_type,amount_ucr,available_after_ucr,held_after_ucr,run_id,meter,ref_kind,reverses_entry_id
    FROM billing.ledger_entry WHERE org_id=$1 AND ($2::bigint IS NULL OR account_version < $2)
      AND ($3::boolean OR entry_type NOT IN ('hold','release'))
    ORDER BY account_version DESC LIMIT $4`, [orgId, options.before?.toString() ?? null, options.holds === true, limit + 1])).rows;
  const page = rows.slice(0, limit);
  return {
    entries: page.map(row => ({
      id: String(row.id), createdAt: new Date(row.created_at), type: String(row.entry_type), amountUcr: big(row.amount_ucr),
      availableAfterUcr: big(row.available_after_ucr), heldAfterUcr: big(row.held_after_ucr), runId: row.run_id ? String(row.run_id) : null,
      meter: row.meter ?? null, refKind: row.ref_kind ?? null, reverses: row.reverses_entry_id ? String(row.reverses_entry_id) : null,
    } satisfies LedgerRow)),
    nextCursor: rows.length > limit ? String(page.at(-1)!.account_version) : null,
  };
}

/* ---------------------------------------------------------- low balance --- */

/** §6.10: alert below 500 credits, or 20 % of the last pack bought when that is more. */
export const LOW_BALANCE_DEFAULT_CREDITS = 500;
/** The default rule, whatever the owner set. */
export async function defaultLowBalanceThresholdUcr(db: PoolClient, orgId: string): Promise<bigint> {
  const row = (await db.query(`SELECT base_ucr + coalesce(bonus_ucr, 0) AS credits FROM billing.top_up_order
    WHERE org_id=$1 AND status='paid' ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1`, [orgId])).rows[0];
  const floor = BigInt(LOW_BALANCE_DEFAULT_CREDITS) * UCR_PER_CREDIT;
  const fromPack = row ? (big(row.credits) * BigInt(20)) / BigInt(100) : ZERO;
  return fromPack > floor ? fromPack : floor;
}

export interface LowBalanceThreshold {
  /** What the alert and the banner use. */
  thresholdUcr: bigint;
  /** The owner's own threshold (Settings → Billing and usage → Limits and alerts, migration 112), or null for the default. */
  customUcr: bigint | null;
  defaultUcr: bigint;
}

/** The workspace's low-balance threshold: the owner's own (§6.12 "Limits and alerts"), else the §6.10 default. */
export async function lowBalanceThreshold(db: PoolClient, orgId: string): Promise<LowBalanceThreshold> {
  const custom = (await db.query("SELECT low_balance_threshold_ucr FROM billing.alert_setting WHERE org_id=$1", [orgId])).rows[0]?.low_balance_threshold_ucr;
  const defaultUcr = await defaultLowBalanceThresholdUcr(db, orgId);
  const customUcr = custom === null || custom === undefined ? null : big(custom);
  return { thresholdUcr: customUcr ?? defaultUcr, customUcr, defaultUcr };
}

export async function lowBalanceThresholdUcr(db: PoolClient, orgId: string): Promise<bigint> {
  return (await lowBalanceThreshold(db, orgId)).thresholdUcr;
}

/** Whether the account ever received credits (no alerts for a workspace that never had any). */
export async function everFunded(db: PoolClient, orgId: string): Promise<boolean> {
  return (await db.query("SELECT EXISTS (SELECT 1 FROM billing.credit_lot WHERE org_id=$1) AS funded", [orgId])).rows[0].funded === true;
}
