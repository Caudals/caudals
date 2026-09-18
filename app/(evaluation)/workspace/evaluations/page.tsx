import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceEvaluations } from "@/components/evals/workspace-evaluations";
export default async function EvaluationsPage() {
  const identity = await requirePageIdentity("/workspace/evaluations");
  return (
    <EvalShell identity={identity}>
      <WorkspaceEvaluations workspaces={identity.workspaces} />
    </EvalShell>
  );
}
