"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { transitionOperatorWorkflow } from "@/lib/actions/operator-console-actions";
import type {
  OperatorModuleSummary,
  OperatorWorkItem,
} from "@/lib/operator/console-snapshot";
import {
  getNextWorkflowTransitions,
  getWorkflowNameForRecordType,
} from "@/lib/operator/workflows";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type OperatorWorkQueueProps = {
  module: OperatorModuleSummary;
  initialItems: OperatorWorkItem[];
};

type WorkItemRowProps = {
  item: OperatorWorkItem;
  onTransitioned: (itemId: string, toState: string) => void;
};

function severityClassName(severity: OperatorWorkItem["severity"]) {
  if (severity === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function WorkItemRow({ item, onTransitioned }: WorkItemRowProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const workflow = getWorkflowNameForRecordType(item.recordType);
  const transitions = useMemo(
    () => (workflow ? getNextWorkflowTransitions(workflow, item.state) : []),
    [item.state, workflow]
  );
  const defaultTargetState = transitions[0]?.to ?? "";
  const [targetState, setTargetState] = useState(defaultTargetState);
  const canTransition = Boolean(workflow && targetState && transitions.length > 0);

  const handleTransition = () => {
    if (!workflow || !targetState) return;

    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await transitionOperatorWorkflow({
        workflow,
        targetId: item.id,
        fromState: item.state,
        toState: targetState,
        reason: reason.trim() || undefined,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      onTransitioned(item.id, targetState);
      setReason("");
      setFeedback(
        result.persisted
          ? t("State updated and audit event recorded.")
          : t("State preview updated in fixture mode.")
      );
    });
  };

  return (
    <div className="grid gap-4 border-t border-gray-100 py-4 first:border-t-0 xl:grid-cols-[0.78fr_1.12fr_1.2fr] xl:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-gray-200 bg-gray-50 font-mono text-[10px] text-gray-600"
          >
            {item.recordType}
          </Badge>
          <Badge
            variant="outline"
            className={cn("rounded-full text-[10px]", severityClassName(item.severity))}
          >
            {t(item.severity)}
          </Badge>
        </div>
        <p className="mt-2 truncate font-mono text-xs text-gray-500">{item.id}</p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-950">{item.title}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{item.detail}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {t("State")}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-gray-950">
              {item.state}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {t("Next action")}
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-950">
              {t(item.nextAction)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
          <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
          {t("Inline state transition")}
        </div>
        {canTransition ? (
          <div className="mt-3 grid gap-2">
            <div className="grid gap-2 sm:grid-cols-[0.8fr_1fr]">
              <Select
                value={targetState}
                onValueChange={setTargetState}
                disabled={isPending}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full border-gray-200 bg-white shadow-none"
                  aria-label={t("Next state")}
                >
                  <SelectValue placeholder={t("Next state")} />
                </SelectTrigger>
                <SelectContent>
                  {transitions.map((transition) => (
                    <SelectItem
                      key={`${transition.from}-${transition.to}`}
                      value={transition.to}
                    >
                      {transition.to}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isPending}
                placeholder={t("Transition reason")}
                className="h-8 border-gray-200 bg-white text-xs shadow-none"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 w-fit bg-gray-950 text-xs text-white shadow-none hover:bg-gray-800"
              disabled={isPending}
              onClick={handleTransition}
            >
              {isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              )}
              {t("Apply transition")}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-gray-500">
            {workflow
              ? t("This record is already in a terminal state.")
              : t("No state transition is configured for this record type.")}
          </p>
        )}
        <div aria-live="polite" className="mt-2 min-h-5">
          {error ? (
            <p className="text-xs font-medium text-red-700">{error}</p>
          ) : feedback ? (
            <p className="text-xs font-medium text-emerald-700">{feedback}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OperatorWorkQueue({
  module,
  initialItems,
}: OperatorWorkQueueProps) {
  const t = useTranslations();
  const [items, setItems] = useState(initialItems);

  const handleTransitioned = (itemId: string, toState: string) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              state: toState,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-950">
              {t(module.title)} / {t("Work queue")}
            </p>
            <p className="mt-1 text-sm text-gray-500">{t(module.description)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {module.savedViews.map((view) => (
              <Badge
                key={view}
                variant="outline"
                className="rounded-full border-gray-200 bg-gray-50"
              >
                {t(view)}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="p-5">
        {items.length > 0 ? (
          items.map((item) => (
            <WorkItemRow
              key={`${item.moduleKey}-${item.recordType}-${item.id}-${item.state}`}
              item={item}
              onTransitioned={handleTransitioned}
            />
          ))
        ) : (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
            {t("No records need operator attention in this module.")}
          </div>
        )}
      </div>
    </section>
  );
}
