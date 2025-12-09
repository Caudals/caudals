"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateOnboardingStep } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";

export type OnboardingStep = {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
  completed_at: string | null;
};

export function OnboardingSteps({ steps }: { steps: OnboardingStep[] }) {
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const router = useRouter();
  const t = useTranslations();

  const mutate = (stepId: string, status: OnboardingStep["status"]) => {
    startTransition(async () => {
      const result = await updateOnboardingStep(stepId, status);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(t("Progress updated"));
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.id} className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
          <div>
            <p className="font-medium">{step.label}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {step.status === "in_progress" ? t("In progress") : t(step.status === "done" ? "Done" : "Pending")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => mutate(step.id, "in_progress")}
            >
              {t("In progress")}
            </Button>
            <Button size="sm" disabled={isPending} onClick={() => mutate(step.id, "done")}>
              {t("Mark done")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
