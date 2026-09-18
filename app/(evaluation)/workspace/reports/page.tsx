import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceReports } from "@/components/evals/workspace-evaluations";

export default async function ReportsPage() {
  const identity = await requirePageIdentity("/workspace/reports");
  return <EvalShell identity={identity}><WorkspaceReports workspaces={identity.workspaces} /></EvalShell>;
}
