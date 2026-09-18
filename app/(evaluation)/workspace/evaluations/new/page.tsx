import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { NewEvaluationFlow } from "@/components/evals/workspace-evaluations";

export default async function NewEvaluationPage() {
  const identity = await requirePageIdentity("/workspace/evaluations/new");
  return (
    <EvalShell identity={identity}>
      <NewEvaluationFlow workspaces={identity.workspaces} />
    </EvalShell>
  );
}
