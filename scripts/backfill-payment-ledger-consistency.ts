import { config } from "dotenv";
import { runPaymentLedgerConsistencyRepair } from "@/lib/jobs/payment-ledger-consistency";

config({ path: ".env.local" });

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;

async function main() {
  const summary = await runPaymentLedgerConsistencyRepair({
    dryRun,
    repairMissingWallets: !args.has("--skip-missing-wallets"),
    repairWalletBalances: args.has("--fix-wallet-balances"),
    repairDatasetPaidAmount: !args.has("--skip-dataset-paid-amount"),
    repairDatasetPaymentStatus: !args.has("--skip-dataset-status"),
  });

  console.info(
    JSON.stringify(
      {
        job: "backfill-payment-ledger-consistency",
        summary,
      },
      null,
      2
    )
  );

  if (apply && summary.after.totals.highSeverityCount > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("backfill-payment-ledger-consistency failed", error);
  process.exit(1);
});
