import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceSettings } from "@/components/evals/workspace-settings";

export default async function SettingsPage() {
  await requirePageIdentity("/workspace/settings");
  return (
    <>
      <WorkspaceSettings />
    </>
  );
}
