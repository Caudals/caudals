import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceTestSetEditor } from "@/components/evals/workspace-test-sets";

export default async function TestSetEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePageIdentity("/workspace/test-sets");
  return <EvalShell identity={identity}><WorkspaceTestSetEditor suiteId={(await params).id} workspaces={identity.workspaces} /></EvalShell>;
}
