import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceSettings } from "@/components/evals/workspace-settings";
import { getMarketingSiteOrigin } from "@/lib/seo";
import { billingEstimatesMode } from "@/lib/billing/config";

export default async function SettingsPage() {
  await requirePageIdentity("/workspace/settings");
  return (
    <>
      {/* The DPA row links the public DPA page and its Word template (launch L-30).
          The API reference lists the estimate endpoint only once tokens may call it (launch L-20). */}
      <WorkspaceSettings marketingOrigin={getMarketingSiteOrigin()} estimatesApi={billingEstimatesMode() === "all"} />
    </>
  );
}
