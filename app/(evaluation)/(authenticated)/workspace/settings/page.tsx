import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceSettings } from "@/components/evals/workspace-settings";
import { getMarketingSiteOrigin } from "@/lib/seo";
import { billingEstimatesMode } from "@/lib/billing/config";
import { integrationsV2Enabled } from "@/lib/evals/monitoring/integrations-flag";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";

export default async function SettingsPage() {
  await requirePageIdentity("/workspace/settings");
  return (
    <>
      {/* The DPA row links the public DPA page and its Word template (launch L-30).
          The API reference lists the estimate endpoint only once tokens may call it (launch L-20).
          Integrations v2 (launch L-19) is read here and passed down, never from a public env value.
          Data controls (answer retention, workspace export) follow DATA_CONTROLS_ENABLED (launch L-32). */}
      <WorkspaceSettings marketingOrigin={getMarketingSiteOrigin()} estimatesApi={billingEstimatesMode() === "all"} integrationsV2={integrationsV2Enabled()} dataControls={dataControlsEnabled()} />
    </>
  );
}
