import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { WorkspaceSettings } from "@/components/evals/workspace-settings";

export default async function SettingsPage() {
  const identity = await requirePageIdentity("/workspace/settings");
  return (
    <EvalShell identity={identity}>
      <WorkspaceSettings />
    </EvalShell>
  );
}
