"use client";
import { Button } from "@/components/ui/button";
import {
  PageHeading,
  Status,
  SessionRecovery,
} from "@/components/evals/primitives";
import { t } from "@/lib/evals/messages/en";
export default function EvaluationError({ reset }: { reset: () => void }) {
  return (
    <section lang="en" className="eval-panel">
      <PageHeading title={t("unavailable")} />
      <Status error>{t("unavailableHelp")}</Status>
      <Button onClick={reset}>{t("retry")}</Button>
      <SessionRecovery />
    </section>
  );
}
