import { config } from "dotenv";
import { runPaymentLedgerConsistencyCheck } from "@/lib/jobs/payment-ledger-consistency";

config({ path: ".env.local" });

const args = new Set(process.argv.slice(2));
const allowDrift = args.has("--allow-drift");

async function main() {
  const report = await runPaymentLedgerConsistencyCheck();

  console.info(
    JSON.stringify(
      {
        job: "check-payment-ledger-consistency",
        report,
      },
      null,
      2
    )
  );

  if (!allowDrift && report.totals.issueCount > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("check-payment-ledger-consistency failed", error);
  process.exit(1);
});
