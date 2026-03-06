"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateOnboardingStep } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, CircleDashed } from "lucide-react";

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
    <Card className="shadow-none border-border bg-background rounded-2xl overflow-hidden max-w-4xl py-0 gap-0">
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {steps.map((step) => (
            <div key={step.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-4 mb-4 sm:mb-0">
                <div className="mt-0.5">
                  {step.status === "done" ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  ) : step.status === "in_progress" ? (
                    <div className="h-6 w-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  ) : (
                    <CircleDashed className="h-6 w-6 text-slate-500/40" />
                  )}
                </div>
                <div>
                  <p className={`font-semibold text-base ${step.status === 'done' ? 'text-slate-500 line-through' : 'text-foreground'}`}>{step.label}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {step.status === "in_progress" ? t("Currently in progress...") : t(step.status === "done" ? "Completed successfully" : "Ready to start")}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 sm:ml-auto pl-10 sm:pl-0">
                {step.status !== "done" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || step.status === "in_progress"}
                      onClick={() => mutate(step.id, "in_progress")}
                      className="shadow-none rounded-lg h-9"
                    >
                      {t("Start")}
                    </Button>
                    <Button 
                      size="sm" 
                      disabled={isPending} 
                      onClick={() => mutate(step.id, "done")}
                      className="shadow-none rounded-lg h-9 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white"
                    >
                      {t("Mark done")}
                    </Button>
                  </>
                )}
                {step.status === "done" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => mutate(step.id, "pending")}
                    className="text-slate-500 shadow-none rounded-lg h-9"
                  >
                    {t("Reset")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
