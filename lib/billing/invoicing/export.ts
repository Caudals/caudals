/**
 * The monthly accountant export (launch spec v2 §6.13, §6.14; L-13): what the
 * database computes (billing.accountant_export) rendered as CSV files and a
 * summary, reconciled to Stripe's balance transactions for the same month.
 *
 * Until an invoicing vendor is chosen (D-04), the accountant issues the
 * invoices and rectifying invoices listed here ("documents to issue"), in the
 * series shown, and ops attach the numbers and PDFs. Amounts are in euros with
 * two decimals; credits are exact (up to six decimals for bonus credits).
 *
 * scripts/billing/monthly-export.ts does the file I/O.
 */
import type Stripe from "stripe";
import type { LegalEntity } from "@/lib/legal/entity";
import { documentHeading, lineText } from "./copy";
import { documentFromRow, type InvoiceDocument } from "./index";

type Row = Record<string, unknown>;

export interface AccountantExport {
  month: string; livemode: boolean; time_zone: string; from: string; to: string; generated_at: string; complete: boolean;
  sales: Array<{ tax_treatment: string; tax_mention: string | null; orders: number; net_cents: number; vat_cents: number; gross_cents: number; credits: number; bonus_credits: number }>;
  refunds: Array<{ tax_treatment: string; orders: number; net_cents: number; vat_cents: number; gross_cents: number }>;
  chargebacks: Array<{ order_id: string; org_id: string; tax_treatment: string; net_cents: number; vat_cents: number; gross_cents: number; at: string; credits_removed: number }>;
  purchased_credits: Record<string, { credits: number; eur: number }>;
  free_credits: Record<string, Record<string, number>>;
  orders: ExportOrder[];
  documents: Row[];
  checks: Record<string, number>;
}

export interface ExportOrder {
  id: string; org_id: string; kind: string; status: string; paid_at: string | null; refunded_at: string | null;
  net_cents: number; vat_cents: number; gross_cents: number; tax_treatment: string; credits: number; bonus_credits: number;
  legal_name: string; tax_id: string; country: string; payment_intent: string | null; charge: string | null; refund: string | null;
  risk_flags: string[]; invoice: { id: string; status: string; number: string | null } | null; credit_note: { id: string; status: string; number: string | null } | null;
}

/** A Stripe balance transaction, reduced to what reconciliation needs. */
export interface BalanceTransaction {
  id: string; type: string; amount: number; fee: number; net: number; currency: string; created: number;
  sourceId: string | null; paymentIntentId: string | null;
}

export type ReconciliationStatus = "matched" | "amount_mismatch" | "missing_in_stripe";
export interface ReconciliationRow {
  orderId: string; movement: "payment" | "refund"; expectedCents: number; stripeAmountCents: number | null; feeCents: number | null;
  netCents: number | null; stripeId: string | null; status: ReconciliationStatus;
}
export interface Reconciliation {
  rows: ReconciliationRow[];
  totals: {
    ordersGrossCents: number; refundsGrossCents: number; stripeChargesCents: number; stripeRefundsCents: number; feesCents: number;
    netCents: number; payoutsCents: number; otherCents: number;
  };
  unmatched: Array<{ id: string; type: string; amount: number; sourceId: string | null }>;
  issues: number;
  reconciled: boolean;
}

const PAYMENT_TYPES = new Set(["charge", "payment"]);
const REFUND_TYPES = new Set(["refund", "payment_refund"]);

/**
 * Matches the month's paid and refunded orders to Stripe's balance
 * transactions (by charge, refund or PaymentIntent id): every payment must
 * appear once with the order's gross amount, every refund with its negative.
 * Charges and refunds that match no order (another integration, or a
 * payment on the other side of the month boundary) are listed, not counted
 * as issues. Payouts and fees are totalled.
 */
export function reconcileStripe(data: Pick<AccountantExport, "orders" | "from" | "to">, transactions: BalanceTransaction[]): Reconciliation {
  const used = new Set<string>();
  const rows: ReconciliationRow[] = [];
  const from = Date.parse(data.from), to = Date.parse(data.to);
  const inMonth = (at: string | null) => at !== null && Date.parse(at) >= from && Date.parse(at) < to;
  const find = (types: Set<string>, ids: Array<string | null>, intent: string | null) => transactions.find(tx => !used.has(tx.id) && types.has(tx.type)
    && ((tx.sourceId !== null && ids.includes(tx.sourceId)) || (intent !== null && tx.paymentIntentId === intent)));
  for (const order of data.orders) {
    const movements: Array<["payment" | "refund", Set<string>, Array<string | null>, number]> = [];
    if (inMonth(order.paid_at)) movements.push(["payment", PAYMENT_TYPES, [order.charge], order.gross_cents]);
    if (order.status === "refunded" && inMonth(order.refunded_at)) movements.push(["refund", REFUND_TYPES, [order.refund], -order.gross_cents]);
    for (const [movement, types, ids, expected] of movements) {
      const tx = find(types, ids, order.payment_intent);
      if (tx) used.add(tx.id);
      rows.push({
        orderId: order.id, movement, expectedCents: expected, stripeAmountCents: tx?.amount ?? null, feeCents: tx?.fee ?? null, netCents: tx?.net ?? null,
        stripeId: tx?.id ?? null, status: !tx ? "missing_in_stripe" : tx.amount !== expected || tx.currency !== "eur" ? "amount_mismatch" : "matched",
      });
    }
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const matched = transactions.filter(tx => used.has(tx.id));
  const unmatched = transactions.filter(tx => !used.has(tx.id) && (PAYMENT_TYPES.has(tx.type) || REFUND_TYPES.has(tx.type)));
  const issues = rows.filter(row => row.status !== "matched").length;
  return {
    rows,
    totals: {
      ordersGrossCents: sum(rows.filter(row => row.movement === "payment").map(row => row.expectedCents)),
      refundsGrossCents: sum(rows.filter(row => row.movement === "refund").map(row => row.expectedCents)),
      stripeChargesCents: sum(matched.filter(tx => PAYMENT_TYPES.has(tx.type)).map(tx => tx.amount)),
      stripeRefundsCents: sum(matched.filter(tx => REFUND_TYPES.has(tx.type)).map(tx => tx.amount)),
      feesCents: sum(matched.map(tx => tx.fee)),
      netCents: sum(matched.map(tx => tx.net)),
      payoutsCents: sum(transactions.filter(tx => tx.type === "payout").map(tx => tx.amount)),
      otherCents: sum(unmatched.map(tx => tx.amount)),
    },
    unmatched: unmatched.map(tx => ({ id: tx.id, type: tx.type, amount: tx.amount, sourceId: tx.sourceId })),
    issues,
    reconciled: issues === 0,
  };
}

/* ---------------------------------------------------------------- CSV --- */

/** One CSV cell: quoted when needed, and a leading = + - @ (spreadsheet formulas) defused. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : String(value);
  // A negative amount ("-20.00") stays a number.
  if (typeof value === "string" && /^(?:[=+@\t\r]|-(?![0-9.]))/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function csv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}
const eur = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));

const TREATMENT_LABEL: Record<string, string> = {
  es_vat: "Spain, IVA 21 %", eu_reverse_charge: "EU business, reverse charge", non_eu_not_subject: "Outside the EU, not subject",
};

export const PURCHASED_BUCKETS = ["opening", "purchased", "consumed", "returned", "refunded", "expired", "charged_back", "adjusted", "closing"] as const;
const BUCKET_LABEL: Record<string, string> = {
  opening: "Opening deferred balance", purchased: "Purchased", consumed: "Consumed (revenue)", returned: "Returned to customers (failed runs)",
  refunded: "Refunded purchases", expired: "Expired (breakage)", charged_back: "Charged back", adjusted: "Adjustments", closing: "Closing deferred balance",
};

export interface ExportFiles { [name: string]: string }

/** The files of one month's export: summary.md and CSVs. */
export function renderExport(data: AccountantExport, options: { issuer: LegalEntity | null; reconciliation?: Reconciliation | null }): ExportFiles {
  const documents = data.documents.map(row => Object.assign(
    documentFromRow({ ...row, original: row.rectifies ?? null, invoice_id: (row.rectifies as Row | null)?.id ?? null }) as InvoiceDocument,
    { numberPattern: String(row.number_pattern ?? ""), pdfAttached: Boolean(row.pdf_attached) }));
  const toIssue = documents.filter(document => document.status === "queued" || document.status === "pending_issue");
  const recon = options.reconciliation ?? null;
  const files: ExportFiles = {};

  files["sales.csv"] = csv(["tax_treatment", "mention", "orders", "credits", "bonus_credits", "net_eur", "vat_eur", "gross_eur"],
    [
      ...data.sales.map(s => [s.tax_treatment, s.tax_mention, s.orders, s.credits, s.bonus_credits, eur(s.net_cents), eur(s.vat_cents), eur(s.gross_cents)]),
      ...data.refunds.map(r => [`${r.tax_treatment} (refunds)`, null, r.orders, null, null, eur(r.net_cents), eur(r.vat_cents), eur(r.gross_cents)]),
    ]);
  files["credits.csv"] = csv(["bucket", "credits", "eur_at_price_paid"],
    PURCHASED_BUCKETS.map(bucket => [bucket, data.purchased_credits[bucket]?.credits ?? 0, (data.purchased_credits[bucket]?.eur ?? 0).toFixed(2)]));
  files["orders.csv"] = csv(["order_id", "workspace_id", "kind", "status", "paid_at", "refunded_at", "legal_name", "tax_id", "country", "tax_treatment",
    "credits", "bonus_credits", "net_eur", "vat_eur", "gross_eur", "payment_intent", "charge", "refund", "risk_flags", "invoice_status", "invoice_number",
    "rectifying_status", "rectifying_number"],
    data.orders.map(o => [o.id, o.org_id, o.kind, o.status, o.paid_at, o.refunded_at, o.legal_name, o.tax_id, o.country, o.tax_treatment, o.credits,
      o.bonus_credits, eur(o.net_cents), eur(o.vat_cents), eur(o.gross_cents), o.payment_intent, o.charge, o.refund, o.risk_flags.join(" "),
      o.invoice?.status ?? "missing", o.invoice?.number, o.credit_note?.status, o.credit_note?.number]));
  files["documents.csv"] = csv(["document_id", "kind", "status", "series", "number_pattern", "number", "issue_date", "operation_date", "language",
    "title", "customer_legal_name", "customer_tax_id", "customer_tax_id_kind", "customer_country", "vies_status", "vies_consultation", "address",
    "postal_code", "city", "region", "billing_email", "lines", "net_eur", "vat_rate_percent", "vat_eur", "gross_eur", "tax_treatment", "mention",
    "rectifies_number", "rectifies_document_id", "order_id", "workspace_id", "pdf_attached"],
    documents.map(d => [d.id, d.kind, d.status, d.seriesCode, d.numberPattern, d.number, d.issueDate, d.operationDate, d.locale, documentHeading(d),
      d.customer.legalName, d.customer.taxId, d.customer.taxIdKind, d.customer.country, d.customer.viesStatus, d.customer.viesConsultation,
      [d.customer.addressLine1, d.customer.addressLine2].filter(Boolean).join(", "), d.customer.postalCode, d.customer.city, d.customer.region,
      d.customer.billingEmail, d.lines.map(line => lineText(line, d.locale)).join(" | "), eur(d.netCents), (d.vatRateBp / 100).toFixed(2),
      eur(d.vatCents), eur(d.grossCents), d.taxTreatment, d.taxMention, d.original?.number, d.invoiceId, d.orderId, d.orgId, d.pdfAttached]));
  if (recon) {
    files["reconciliation.csv"] = csv(["order_id", "movement", "expected_eur", "stripe_eur", "fee_eur", "net_eur", "stripe_balance_transaction", "status"],
      recon.rows.map(r => [r.orderId, r.movement, eur(r.expectedCents), eur(r.stripeAmountCents), eur(r.feeCents), eur(r.netCents), r.stripeId, r.status]));
  }

  const issuer = options.issuer;
  const lines = [
    `# Caudals accountant export · ${data.month}${data.livemode ? "" : " · STRIPE TEST MODE (not for the books)"}`,
    "",
    `Period: ${data.from} to ${data.to} (${data.time_zone} calendar month)${data.complete ? "" : " · the month is not over yet"}. Generated ${data.generated_at}.`,
    "",
    issuer
      ? `Issuer: ${issuer.name} · NIF ${issuer.nif} · ${issuer.address}${issuer.registry ? ` · ${issuer.registry}` : ""}`
      : "Issuer: the company's legal data are not configured yet (LEGAL_ENTITY_*, decision I-1). Use the registered data when issuing.",
    "",
    "## Credits sold (top-ups paid in the month)",
    "",
    "| Treatment | Mention on the invoice | Orders | Net € | IVA € | Gross € |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...data.sales.map(s => `| ${TREATMENT_LABEL[s.tax_treatment] ?? s.tax_treatment} | ${s.tax_mention ?? "IVA 21 %"} | ${s.orders} | ${eur(s.net_cents)} | ${eur(s.vat_cents)} | ${eur(s.gross_cents)} |`),
    ...(data.sales.length ? [] : ["| — | | 0 | 0.00 | 0.00 | 0.00 |"]),
    "",
    "Refunds in the month (rectifying invoices):",
    "",
    ...(data.refunds.length ? data.refunds.map(r => `- ${TREATMENT_LABEL[r.tax_treatment] ?? r.tax_treatment}: ${r.orders} orders, net ${eur(r.net_cents)}, IVA ${eur(r.vat_cents)}, gross ${eur(r.gross_cents)}`) : ["- none"]),
    "",
    `Chargebacks in the month: ${data.chargebacks.length}${data.chargebacks.length ? " (see orders.csv; no automatic rectifying invoice, review with the gestor)" : ""}.`,
    "",
    "## Purchased credits (deferred revenue, at the price paid; IVA accrued at purchase)",
    "",
    "| | Credits | € |",
    "| --- | ---: | ---: |",
    ...PURCHASED_BUCKETS.map(bucket => `| ${BUCKET_LABEL[bucket]} | ${data.purchased_credits[bucket]?.credits ?? 0} | ${(data.purchased_credits[bucket]?.eur ?? 0).toFixed(2)} |`),
    "",
    "Free credits (bonus, grants, promotions, allowances; no price, no IVA), credits moved in the month:",
    "",
    ...(Object.keys(data.free_credits).length
      ? Object.entries(data.free_credits).map(([source, buckets]) => `- ${source}: ${Object.entries(buckets).map(([bucket, value]) => `${bucket} ${value}`).join(", ")}`)
      : ["- none"]),
    "",
    "## Invoices and rectifying invoices",
    "",
    `${toIssue.length} to issue (documents.csv, status pending_issue or queued), ${documents.filter(d => d.status === "issued").length} issued.`,
    "Issue each one in the series shown (CAU- credits, CAU-R- rectifying; to confirm with the gestor), with the customer's fiscal data, the lines and the VAT line or mention listed. A rectifying invoice cites the original invoice's number. Then send the numbers and PDFs to ops to attach.",
    "",
    "## Checks",
    "",
    ...Object.entries(data.checks).map(([name, value]) => `- ${name.replaceAll("_", " ")}: ${value}${value && name !== "documents_to_issue" ? " (REVIEW)" : ""}`),
    "",
    "## Stripe",
    "",
    ...(recon ? [
      `${recon.reconciled ? "Reconciled" : `**${recon.issues} differences**`}: ${recon.rows.length} movements checked against balance transactions.`,
      "",
      `- Payments: orders ${eur(recon.totals.ordersGrossCents)} · Stripe ${eur(recon.totals.stripeChargesCents)}`,
      `- Refunds: orders ${eur(recon.totals.refundsGrossCents)} · Stripe ${eur(recon.totals.stripeRefundsCents)}`,
      `- Stripe fees ${eur(recon.totals.feesCents)} · net ${eur(recon.totals.netCents)} · payouts in the month ${eur(recon.totals.payoutsCents)}`,
      `- Stripe charges or refunds matching no order of the month: ${recon.unmatched.length} (${eur(recon.totals.otherCents)})`,
    ] : ["Not reconciled in this run (add --stripe with the mode's key)."]),
    "",
  ];
  files["summary.md"] = lines.join("\n");
  return files;
}

/* ------------------------------------------------------------ inputs --- */

/** The read-only SQL for psql (the database owner runs billing.accountant_export as a system actor). */
export function exportSql(month: string, mode: "live" | "test") {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must be YYYY-MM");
  return [
    "BEGIN READ ONLY;",
    "SELECT set_config('evals.actor_id','system:accountant-export',true) \\g /dev/null",
    `SELECT billing.accountant_export('${month}-01'::date,${mode === "live" ? "true" : "false"});`,
    "ROLLBACK;",
  ].join("\n");
}

/** Every balance transaction created in [from, to), with its source's PaymentIntent. */
export async function balanceTransactions(stripe: Stripe, from: string, to: string): Promise<BalanceTransaction[]> {
  const out: BalanceTransaction[] = [];
  const params = { created: { gte: Math.floor(Date.parse(from) / 1000), lt: Math.floor(Date.parse(to) / 1000) }, limit: 100, expand: ["data.source"] };
  for await (const tx of stripe.balanceTransactions.list(params)) {
    const source = tx.source && typeof tx.source === "object" ? tx.source as { id: string; payment_intent?: string | { id: string } | null } : null;
    const intent = source?.payment_intent;
    out.push({
      id: tx.id, type: tx.type, amount: tx.amount, fee: tx.fee, net: tx.net, currency: tx.currency, created: tx.created,
      sourceId: typeof tx.source === "string" ? tx.source : source?.id ?? null,
      paymentIntentId: typeof intent === "string" ? intent : intent?.id ?? null,
    });
  }
  return out;
}
