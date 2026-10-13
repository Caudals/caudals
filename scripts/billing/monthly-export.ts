/**
 * Monthly accountant export (launch spec v2 §6.13, §6.14; package L-13).
 *
 * For one calendar month (Madrid time) and one Stripe mode: credits sold
 * (net and IVA by treatment), refunds and chargebacks, purchased credits
 * consumed, returned, expired and the deferred balance, free credits, the
 * orders, and the invoices and rectifying invoices the accountant has to
 * issue (with full fiscal data and the expected series), plus a
 * reconciliation to Stripe's balance transactions. Until an invoicing vendor
 * is chosen (D-04), this is how invoices get issued.
 *
 * 1. The data, read-only, as the database owner (no credentials needed here):
 *    npx tsx scripts/billing/monthly-export.ts --sql --month 2026-10 [--mode live|test] \
 *      | sudo docker exec -i <caudals-postgres container> psql -U postgres -d caudals -X -q -At > export.json
 * 2. The files, optionally reconciled to Stripe with the mode's key (never printed):
 *    scripts/billing/with-app-credentials.sh STRIPE_SECRET_KEY,LEGAL_ENTITY_NAME,LEGAL_ENTITY_NIF,LEGAL_ENTITY_ADDRESS,LEGAL_ENTITY_REGISTRY -- \
 *      node --conditions=react-server --import tsx scripts/billing/monthly-export.ts --input export.json --out <dir> [--stripe]
 *
 * Writes summary.md, sales.csv, credits.csv, orders.csv, documents.csv and
 * (with --stripe) reconciliation.csv. Exit code 2 when a check or the
 * reconciliation needs review. The issuer comes from LEGAL_ENTITY_* (I-1);
 * the §3.2 placeholders are ignored like everywhere else.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { balanceTransactions, exportSql, renderExport, reconcileStripe, type AccountantExport } from "../../lib/billing/invoicing/export";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

function previousMonth(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 7);
}

async function main() {
  if (args.includes("--sql")) {
    const mode = flag("--mode") === "test" ? "test" : "live";
    process.stdout.write(exportSql(flag("--month") ?? previousMonth(), mode) + "\n");
    return;
  }
  const input = flag("--input");
  if (!input) {
    process.stderr.write("usage: monthly-export.ts --sql --month YYYY-MM [--mode live|test] | psql …  ·  monthly-export.ts --input export.json --out dir [--stripe]\n");
    process.exitCode = 1;
    return;
  }
  const text = readFileSync(input, "utf8").split("\n").map(line => line.trim()).find(line => line.startsWith("{"));
  if (!text) throw new Error("No export in the input: run the --sql output through psql -At first.");
  const data = JSON.parse(text) as AccountantExport;
  // Loaded here so the --sql step needs neither Stripe nor the server-only entity module.
  const { getLegalEntity } = await import("../../lib/legal/entity");
  let reconciliation = null;
  if (args.includes("--stripe")) {
    const { getStripe } = await import("../../lib/billing/stripe");
    // The key must belong to the export's mode (a live export needs the live key).
    const stripe = getStripe({ ...process.env, BILLING_STRIPE_MODE: data.livemode ? "live" : "test" });
    reconciliation = reconcileStripe(data, await balanceTransactions(stripe, data.from, data.to));
  }
  const files = renderExport(data, { issuer: getLegalEntity(), reconciliation });
  const out = flag("--out") ?? `accountant-export-${data.month}${data.livemode ? "" : "-test"}`;
  mkdirSync(out, { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(out, name), content, { mode: 0o600 });
  const review = Object.entries(data.checks).some(([name, value]) => name !== "documents_to_issue" && value > 0) || (reconciliation !== null && !reconciliation.reconciled);
  process.stdout.write(`${JSON.stringify({ month: data.month, livemode: data.livemode, files: Object.keys(files), checks: data.checks,
    reconciled: reconciliation ? reconciliation.reconciled : null, differences: reconciliation?.issues ?? null, out })}\n`);
  process.exitCode = review ? 2 : 0;
}

main().catch(error => {
  process.stderr.write(`monthly_export_failed: ${error instanceof Error && /^[A-Za-z_ :-]{1,80}$/.test(error.message) ? error.message : "error"}\n`);
  process.exitCode = 1;
});
