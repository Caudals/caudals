import { PwaBrowseClient } from "@/components/pwa/pwa-browse-client";
import { PwaOnboardingCard } from "@/components/pwa/pwa-onboarding";
import { getDatasets } from "@/lib/actions/dataset-actions";

export default async function PwaHomePage() {
  const datasets = await getDatasets();

  return (
    <div className="space-y-4 pb-16">
      <PwaOnboardingCard />
      <PwaBrowseClient initialDatasets={datasets} />
    </div>
  );
}
