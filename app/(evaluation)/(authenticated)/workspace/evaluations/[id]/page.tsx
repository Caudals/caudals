import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvaluationJourney } from "@/components/evals/evaluation-detail";
import { expertReviewOrdersEnabled } from "@/lib/evals/domain/features";
import { intakeV2Enabled } from "@/lib/evals/intake/flags";

export default async function EvaluationJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/evaluations");
  return (
    <>
      {/* Launch L-34 and L-26: the intake v2 and expert review flags are read here, on the server, and passed down. */}
      <EvaluationJourney evaluationId={(await params).id} intakeV2={intakeV2Enabled()} expertReview={expertReviewOrdersEnabled()} />
    </>
  );
}
