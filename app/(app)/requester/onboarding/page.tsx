import { getRequesterOnboarding } from "@/lib/actions/requester-actions";
import { OnboardingSteps } from "@/components/requester/onboarding/onboarding-steps";

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Onboarding</p>
        <h1 className="text-2xl font-semibold">Get set up</h1>
      </div>
      <OnboardingSteps steps={stepsResult} />
    </div>
  );
}
