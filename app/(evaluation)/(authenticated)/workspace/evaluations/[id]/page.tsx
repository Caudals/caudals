import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvaluationJourney } from "@/components/evals/evaluation-detail";

export default async function EvaluationJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/evaluations");
  return (
    <>
      <EvaluationJourney evaluationId={(await params).id} />
    </>
  );
}
