import { getRequesterOnboarding } from "@/lib/actions/requester-actions";
import { OnboardingSteps } from "@/components/requester/onboarding/onboarding-steps";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function OnboardingPage() {
  const stepsResult = await getRequesterOnboarding();

  if (!Array.isArray(stepsResult)) {
    if ("error" in stepsResult) {
      return (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {stepsResult.error}
        </div>
      );
    }
    return null;
  }

  const completed = stepsResult.filter((step) => step.status === "done").length;

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        title="Workspace setup"
        description={`Complete setup milestones to unlock full requester operations and automation. ${completed}/${stepsResult.length} completed.`}
      />
      <OnboardingSteps steps={stepsResult} />
    </div>
  );
}
