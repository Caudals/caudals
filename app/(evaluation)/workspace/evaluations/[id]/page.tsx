import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { EvaluationJourney } from "@/components/evals/workspace-evaluations";

export default async function EvaluationJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await requirePageIdentity("/workspace/evaluations");
  return (
    <EvalShell identity={identity}>
      <EvaluationJourney
        evaluationId={(await params).id}
        workspaces={identity.workspaces}
      />
    </EvalShell>
  );
}
