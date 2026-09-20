"use client";
import { RotateCcw, TriangleAlert } from "lucide-react";
import {
  Action,
  EmptyState,
  SessionRecovery,
  Status,
} from "@/components/evals/primitives";
import { t } from "@/lib/evals/messages/en";

export default function EvaluationError({ reset }: { reset: () => void }) {
  return (
    <div className="p-root" lang="en">
      <div className="p-page">
        <EmptyState title={t("unavailable")} icon={<TriangleAlert />}>
          <p>{t("unavailableHelp")}</p>
          <Status error>{t("error")}</Status>
          <div className="p-row">
            <Action onClick={reset}>
              <RotateCcw aria-hidden="true" />
              {t("retry")}
            </Action>
          </div>
          <SessionRecovery />
        </EmptyState>
      </div>
    </div>
  );
}
