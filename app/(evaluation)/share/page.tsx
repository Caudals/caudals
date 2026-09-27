import { SharedReport } from "@/components/evals/report-view";
import { PublicFrame } from "@/components/evals/public-frame";
import { t } from "@/lib/evals/messages/en";

/** A customer-shared report. No shell: the recipient has no account here. */
export default function Page() {
  return (
    <PublicFrame context={t("sharedPrivately")}>
      <SharedReport />
    </PublicFrame>
  );
}
