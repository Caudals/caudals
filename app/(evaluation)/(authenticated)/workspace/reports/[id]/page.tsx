import { requirePageIdentity } from "@/components/evals/page-identity";
import { AuthenticatedReport } from "@/components/evals/report-view";
import { callUrl } from "@/lib/email/links";
import { expertReviewOrdersEnabled } from "@/lib/evals/domain/features";
import { getMarketingSiteOrigin } from "@/lib/seo";
import { readoutMode } from "@/lib/evals/readout/flags";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/reports");
  // Read at request time: CALCOM_LINK, READOUT_MODE_ENABLED and EXPERT_REVIEW_ORDERS_ENABLED change without a rebuild.
  return <AuthenticatedReport reportId={(await params).id} readoutUrl={callUrl()} marketingOrigin={getMarketingSiteOrigin()} readoutMode={readoutMode()} expertReview={expertReviewOrdersEnabled()} />;
}
