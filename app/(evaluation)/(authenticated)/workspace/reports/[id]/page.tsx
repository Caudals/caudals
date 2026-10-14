import { requirePageIdentity } from "@/components/evals/page-identity";
import { AuthenticatedReport } from "@/components/evals/report-view";
import { callUrl } from "@/lib/email/links";
import { expertReviewOrdersEnabled } from "@/lib/evals/domain/features";
import { getMarketingSiteOrigin } from "@/lib/seo";
import { readoutMode } from "@/lib/evals/readout/flags";
import { reportQuestionsConfigured } from "@/lib/evals/reports/question-flags";
import { publicResultsEnabled } from "@/lib/publication/flags";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/reports");
  // Read at request time: CALCOM_LINK, READOUT_MODE_ENABLED, EXPERT_REVIEW_ORDERS_ENABLED, REPORT_QUESTIONS_* and PUBLIC_RESULTS_ENABLED change without a rebuild.
  return <AuthenticatedReport reportId={(await params).id} readoutUrl={callUrl()} marketingOrigin={getMarketingSiteOrigin()} readoutMode={readoutMode()} expertReview={expertReviewOrdersEnabled()} reportQuestions={reportQuestionsConfigured()} publicResults={publicResultsEnabled()} />;
}
