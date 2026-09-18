import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceSystems } from "@/components/evals/workspace-evaluations";

export default async function SystemsPage() {
  const identity = await requirePageIdentity("/workspace/systems");
  return <EvalShell identity={identity}><WorkspaceSystems workspaces={identity.workspaces} /></EvalShell>;
}
