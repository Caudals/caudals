import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceEvaluations } from "@/components/evals/workspace-evaluations";

export default async function EvaluationsPage() {
  await requirePageIdentity("/workspace/evaluations");
  return (
    <>
      <WorkspaceEvaluations />
    </>
  );
}
