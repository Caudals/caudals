import { csvCell } from "../imports/structured";

/**
 * The partner's monthly statement (launch L-28, spec §7.8): one Madrid
 * calendar month and one Stripe mode, straight from the orders and the ledger
 * (evals.partner_statement). Revenue-share payouts stay manual: the statement
 * is what ops and the partner reconcile against.
 */
export const STATEMENT_SECTIONS = ["referral_payment", "referral_reversal", "allowance_grant", "client_usage"] as const;
export type StatementSection = (typeof STATEMENT_SECTIONS)[number];
export type StatementRow = {
  section: StatementSection;
  occurredAt: string | null;
  orgId: string;
  workspace: string;
  reference: string | null;
  detail: string | null;
  netCents: number | null;
  shareCents: number | null;
  creditsUcr: number | null;
  returnedUcr: number | null;
};
export type StatementMeta = { partner: string; month: string; mode: "live" | "test"; revenueShareBps: number; generatedAt: string };
export type StatementTotals = {
  referredNetCents: number; revenueShareCents: number; creditEquivalent: number;
  allowanceCredits: number; usedCredits: number; returnedCredits: number;
};

const UCR = 1_000_000;
/** 1 credit = €0.01 excl. VAT (§6.2): a revenue share paid in credits is worth 100 credits per euro. */
export const CREDITS_PER_EUR = 100;

export function statementMonth(value: string | null | undefined, now = new Date()): string {
  if (value && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  // Default: the previous Madrid calendar month (statements are run after the month closes).
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export function statementTotals(rows: readonly StatementRow[]): StatementTotals {
  const sum = (section: StatementSection, pick: (row: StatementRow) => number | null) =>
    rows.filter((row) => row.section === section).reduce((total, row) => total + (pick(row) ?? 0), 0);
  const referredNetCents = sum("referral_payment", (row) => row.netCents) + sum("referral_reversal", (row) => row.netCents);
  const revenueShareCents = sum("referral_payment", (row) => row.shareCents) + sum("referral_reversal", (row) => row.shareCents);
  return {
    referredNetCents, revenueShareCents, creditEquivalent: Math.round(revenueShareCents / 100 * CREDITS_PER_EUR),
    allowanceCredits: sum("allowance_grant", (row) => row.creditsUcr) / UCR,
    usedCredits: sum("client_usage", (row) => row.creditsUcr) / UCR,
    returnedCredits: sum("client_usage", (row) => row.returnedUcr) / UCR,
  };
}

const euros = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
const credits = (ucr: number | null) => (ucr == null ? "" : String(Math.round((ucr / UCR) * 100) / 100));
const text = (value: string | null) => csvCell(value ?? "");

export const STATEMENT_COLUMNS = ["section", "date", "workspace_id", "workspace", "reference", "detail", "net_eur", "revenue_share_eur", "credits", "credits_returned"] as const;

/**
 * CSV for spreadsheets: text cells are formula-safe; amounts are plain
 * numbers (euros with two decimals, credits) so they add up as written. The
 * first row describes the statement and the last rows are its totals.
 */
export function renderStatementCsv(meta: StatementMeta, rows: readonly StatementRow[]): string {
  const totals = statementTotals(rows);
  const line = (cells: string[]) => cells.join(",");
  const out = [line([...STATEMENT_COLUMNS])];
  out.push(line(["statement", meta.generatedAt, "", text(meta.partner), meta.month,
    text(`Stripe ${meta.mode} mode; revenue share ${meta.revenueShareBps / 100} % of first-year referred revenue, or ${CREDITS_PER_EUR} credits per euro; payouts by hand`), "", "", "", ""]));
  for (const row of rows) {
    out.push(line([row.section, row.occurredAt ?? "", row.orgId, text(row.workspace), text(row.reference), text(row.detail),
      euros(row.netCents), euros(row.shareCents), credits(row.creditsUcr), credits(row.returnedUcr)]));
  }
  out.push(line(["total_referred_revenue", "", "", "", meta.month, "", euros(totals.referredNetCents), euros(totals.revenueShareCents), "", ""]));
  out.push(line(["total_revenue_share_credits", "", "", "", meta.month, "", "", "", String(totals.creditEquivalent), ""]));
  out.push(line(["total_allowance_granted", "", "", "", meta.month, "", "", "", String(Math.round(totals.allowanceCredits * 100) / 100), ""]));
  out.push(line(["total_client_usage", "", "", "", meta.month, "", "", "", String(Math.round(totals.usedCredits * 100) / 100), String(Math.round(totals.returnedCredits * 100) / 100)]));
  return out.join("\r\n") + "\r\n";
}

export function statementFileName(partner: string, month: string, mode: "live" | "test") {
  const slug = partner.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "partner";
  return `Caudals-partner-statement-${slug}-${month}${mode === "test" ? "-test" : ""}.csv`;
}
