import { SharedReport } from "@/components/evals/report-view";
import { PublicFrame } from "@/components/evals/public-frame";
import { evalsPageMessages } from "@/components/evals/page-messages";
import { getMarketingSiteOrigin } from "@/lib/seo";

/** A customer-shared report. No shell: the recipient has no account here. */
export default async function Page() {
  return (
    <>
      {await evalsPageMessages(["share"])}
      <PublicFrame contextKey="sharedPrivately">
        <SharedReport marketingOrigin={getMarketingSiteOrigin()} />
      </PublicFrame>
    </>
  );
}
