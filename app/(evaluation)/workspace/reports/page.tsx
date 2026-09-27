import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceReports } from "@/components/evals/workspace-reports";

export default async function ReportsPage() {
  const identity = await requirePageIdentity("/workspace/reports");
  return (
    <EvalShell identity={identity}>
      <WorkspaceReports />
    </EvalShell>
  );
}
