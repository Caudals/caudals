import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceSettings } from "@/components/evals/workspace-settings";
import { getMarketingSiteOrigin } from "@/lib/seo";

export default async function SettingsPage() {
  await requirePageIdentity("/workspace/settings");
  return (
    <>
      {/* The DPA row links the public DPA page and its Word template (launch L-30). */}
      <WorkspaceSettings marketingOrigin={getMarketingSiteOrigin()} />
    </>
  );
}
