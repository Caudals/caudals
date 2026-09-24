import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceTestSets } from "@/components/evals/workspace-test-sets";

export default async function TestSetsPage() {
  const identity = await requirePageIdentity("/workspace/test-sets");
  return <EvalShell identity={identity}><WorkspaceTestSets workspaces={identity.workspaces} /></EvalShell>;
}
