import { SharedReport } from "@/components/evals/report-view";
import { PublicFrame } from "@/components/evals/public-frame";

/** A customer-shared report. No shell: the recipient has no account here. */
export default function Page() {
  return (
    <PublicFrame contextKey="sharedPrivately">
      <SharedReport />
    </PublicFrame>
  );
}
