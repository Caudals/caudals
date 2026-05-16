"use client";

import {
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowRight, CheckCircle2, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { OperatorRecordNotes } from "@/components/admin/operator-record-notes";
import { transitionOperatorWorkflow } from "@/lib/actions/operator-console-actions";
import {
  createOperatorRecord,
  deleteOperatorRecord,
  updateOperatorRecord,
} from "@/lib/actions/operator-record-actions";
import type {
  OperatorModuleSummary,
  OperatorWorkItem,
} from "@/lib/operator/console-snapshot";
import {
  getOperatorRecordCrudDescriptor,
  getOperatorRecordFieldDescriptors,
  getOperatorRecordFormGuidance,
  operatorModuleCreateOptions,
  operatorModuleCreateTargets,
  type OperatorRecordCrudType,
} from "@/lib/operator/record-crud";
import {
  getNextWorkflowTransitions,
  getWorkflowNameForRecordType,
} from "@/lib/operator/workflows";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OperatorWorkQueueProps = {
  module: OperatorModuleSummary;
  initialItems: OperatorWorkItem[];
};

type WorkItemRowProps = {
  item: OperatorWorkItem;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (itemId: string, selected: boolean) => void;
  onTransitioned: (itemId: string, toState: string) => void;
  onRecordChanged: (record: OperatorWorkItem) => void;
  onRecordDeleted: (itemId: string) => void;
};

function getTransitionConfig(item: OperatorWorkItem) {
  const workflow = getWorkflowNameForRecordType(item.recordType);
  const transitions = workflow
    ? getNextWorkflowTransitions(workflow, item.state)
    : [];

  return { transitions, workflow };
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, button, [role='combobox']")
  );
}

function savedViewMatchesItem(view: string | null, item: OperatorWorkItem) {
  if (!view) {
    return true;
  }

  const normalizedView = view.toLowerCase();
  const searchable = [
    item.recordType,
    item.id,
    item.title,
    item.state,
    item.detail,
    item.severity,
    item.nextAction,
  ]
    .join(" ")
    .toLowerCase();

  if (normalizedView === "today") {
    return true;
  }

  if (normalizedView.includes("block")) {
    return item.severity === "critical" || searchable.includes("blocked");
  }

  if (
    /\b(review|pending|rework|risk|exception|hold|sla|stale|rotation|escalation|gap)\b/.test(
      normalizedView
    )
  ) {
    return (
      item.severity !== "info" ||
      normalizedView
        .split(/\s+/)
        .some((token) => token.length > 2 && searchable.includes(token))
    );
  }

  const tokens = normalizedView
    .split(/\s+/)
    .filter((token) => token.length > 2 && token !== "my");

  return tokens.length === 0
    ? true
    : tokens.some((token) => searchable.includes(token));
}

function savedViewScope(index: number) {
  return index === 0 ? "Mine" : "Team";
}

function severityClassName(severity: OperatorWorkItem["severity"]) {
  if (severity === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function createFieldValues(
  recordType: string,
  existingFields: Record<string, string> = {}
) {
  return Object.fromEntries(
    getOperatorRecordFieldDescriptors(recordType).map((field) => [
      field.key,
      existingFields[field.key] ?? "",
    ])
  );
}

function RecordSpecificFields({
  recordType,
  values,
  onChange,
  disabled,
  idPrefix,
}: {
  recordType: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled: boolean;
  idPrefix: string;
}) {
  const fields = getOperatorRecordFieldDescriptors(recordType);

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
        Operational fields
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {fields.map((field) => {
          const inputId = `${idPrefix}-${field.key}`;

          return (
            <div key={field.key} className="grid gap-1.5">
              <Label
                htmlFor={inputId}
                className="text-[11px] font-semibold text-gray-500"
              >
                {field.label}
              </Label>
              <Input
                id={inputId}
                type={field.kind === "text" ? "text" : "number"}
                inputMode={
                  field.kind === "integer"
                    ? "numeric"
                    : field.kind === "decimal"
                      ? "decimal"
                      : "text"
                }
                min={field.min}
                max={field.max}
                step={
                  field.kind === "integer"
                    ? "1"
                    : field.kind === "decimal"
                      ? field.step
                      : undefined
                }
                maxLength={field.maxLength}
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={disabled}
                placeholder={field.placeholder}
                className="h-8 border-emerald-100 bg-white text-xs shadow-none"
              />
              <p className="text-[11px] leading-4 text-emerald-900/60">
                {field.help}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkItemRow({
  item,
  selectable,
  selected,
  onSelectedChange,
  onTransitioned,
  onRecordChanged,
  onRecordDeleted,
}: WorkItemRowProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [isCrudPending, startCrudTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [crudFeedback, setCrudFeedback] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDetail, setEditDetail] = useState(item.detail);
  const [editState, setEditState] = useState(item.state);
  const [editFields, setEditFields] = useState(() =>
    createFieldValues(item.recordType, item.fields)
  );
  const crudDescriptor = getOperatorRecordCrudDescriptor(item.recordType);
  const formGuidance = getOperatorRecordFormGuidance(item.recordType);
  const editTitleInputId = `${item.id}-record-primary`;
  const editStateInputId = `${item.id}-record-state`;
  const editDetailInputId = `${item.id}-record-detail`;
  const transitions = useMemo(
    () => getTransitionConfig(item).transitions,
    [item]
  );
  const workflow = getTransitionConfig(item).workflow;
  const defaultTargetState = transitions[0]?.to ?? "";
  const [targetState, setTargetState] = useState(defaultTargetState);
  const canTransition = Boolean(workflow && targetState && transitions.length > 0);

  const handleTransition = (nextTargetState = targetState) => {
    if (!workflow || !nextTargetState) return;

    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await transitionOperatorWorkflow({
        workflow,
        targetId: item.id,
        fromState: item.state,
        toState: nextTargetState,
        reason: reason.trim() || undefined,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      onTransitioned(item.id, nextTargetState);
      setReason("");
      setFeedback(
        result.persisted
          ? t("State updated and audit event recorded.")
          : t("State preview updated in fixture mode.")
      );
    });
  };

  const handleRecordUpdate = () => {
    if (!crudDescriptor?.canUpdate) return;

    setCrudError(null);
    setCrudFeedback(null);

    startCrudTransition(async () => {
      const result = await updateOperatorRecord({
        moduleKey: item.moduleKey,
        recordType: item.recordType,
        targetId: item.id,
        expectedUpdatedAt: item.updatedAt,
        title: editTitle,
        detail: editDetail,
        state: editState,
        fields: editFields,
      });

      if ("error" in result) {
        setCrudError(result.error);
        return;
      }

      if ("record" in result) {
        setEditTitle(result.record.title);
        setEditDetail(result.record.detail);
        setEditState(result.record.state);
        setEditFields(createFieldValues(item.recordType, result.record.fields));
        setCrudFeedback(t("Record updated and audit event recorded."));
        onRecordChanged(result.record);
      }
    });
  };

  const handleRecordDelete = () => {
    if (!crudDescriptor?.canDelete) return;

    const confirmed = window.confirm(
      `${t("Delete record")} ${item.recordType}/${item.id}?`
    );

    if (!confirmed) return;

    setCrudError(null);
    setCrudFeedback(null);

    startCrudTransition(async () => {
      const result = await deleteOperatorRecord({
        moduleKey: item.moduleKey,
        recordType: item.recordType,
        targetId: item.id,
        expectedUpdatedAt: item.updatedAt,
      });

      if ("error" in result) {
        setCrudError(result.error);
        return;
      }

      if ("deletedRecordId" in result) {
        onRecordDeleted(result.deletedRecordId);
      }
    });
  };

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isEditableKeyboardTarget(event.target)) {
      return;
    }

    if (!/^[1-9]$/.test(event.key)) {
      return;
    }

    const transition = transitions[Number(event.key) - 1];

    if (!transition) {
      return;
    }

    event.preventDefault();
    setTargetState(transition.to);
    handleTransition(transition.to);
  };
  const transitionSummary =
    transitions.length > 0
      ? transitions.map((transition) => transition.to).join(" / ")
      : workflow
        ? t("Terminal state")
        : t("No workflow");

  return (
    <div
      id={item.id}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      data-work-queue-row=""
      onKeyDown={handleRowKeyDown}
      className="scroll-mt-24 border-t border-gray-100 py-5 outline-hidden transition-colors first:border-t-0 focus:bg-emerald-50/50 focus:ring-2 focus:ring-emerald-500/30"
    >
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(240px,0.4fr)] lg:items-start">
        <div className="pt-1">
          <Checkbox
            aria-label={t("Select work item")}
            checked={selected}
            disabled={!selectable}
            onCheckedChange={(checked) => {
              onSelectedChange(item.id, checked === true);
            }}
            className="border-gray-300 data-[state=checked]:border-gray-950 data-[state=checked]:bg-gray-950"
          />
        </div>

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
              className={cn(
                "rounded-full text-[10px]",
                severityClassName(item.severity)
              )}
            >
              {t(item.severity)}
            </Badge>
            <span className="truncate font-mono text-xs text-gray-500">
              {item.id}
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-gray-950">
            {item.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{item.detail}</p>
        </div>

        <div className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs sm:grid-cols-3 lg:grid-cols-1">
          <div className="min-w-0">
            <p className="font-medium uppercase tracking-wide text-gray-400">
              {t("State")}
            </p>
            <p className="mt-1 truncate font-mono font-semibold text-gray-950">
              {item.state}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium uppercase tracking-wide text-gray-400">
              {t("Next action")}
            </p>
            <p className="mt-1 truncate font-semibold text-gray-950">
              {t(item.nextAction)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-medium uppercase tracking-wide text-gray-400">
              {t("Next transitions")}
            </p>
            <p className="mt-1 truncate font-mono font-semibold text-gray-950">
              {transitionSummary}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(280px,0.8fr)_minmax(360px,1.15fr)_minmax(280px,0.85fr)]">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            {t("Inline state transition")}
          </div>
          {canTransition ? (
            <div className="mt-3 grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[0.8fr_1fr] xl:grid-cols-1">
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
                    {transitions.map((transition, index) => (
                      <SelectItem
                        key={`${transition.from}-${transition.to}`}
                        value={transition.to}
                      >
                        {index + 1} - {transition.to}
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
                onClick={() => handleTransition()}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                )}
                {t("Apply transition")}
              </Button>
              <p className="text-[11px] leading-4 text-gray-400">
                Focus row, then press 1-{transitions.length} for a one-key
                transition shortcut. Use arrow keys to move between rows.
              </p>
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

        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
            <ListChecks className="h-3.5 w-3.5 text-gray-400" />
            {t("Inline record edit")}
          </div>
          {crudDescriptor ? (
            crudDescriptor.canUpdate || crudDescriptor.canDelete ? (
              <div className="mt-3 grid gap-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_0.7fr]">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={editTitleInputId}
                      className="text-[11px] font-semibold text-gray-500"
                    >
                      {formGuidance?.primaryLabel ?? t("Record title")}
                    </Label>
                    <Input
                      id={editTitleInputId}
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      disabled={!crudDescriptor.canUpdate || isCrudPending}
                      placeholder={
                        formGuidance?.primaryPlaceholder ?? t("Record title")
                      }
                      className="h-8 border-gray-200 bg-white text-xs shadow-none"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={editStateInputId}
                      className="text-[11px] font-semibold text-gray-500"
                    >
                      {t("Record state")}
                    </Label>
                    <Select
                      value={editState}
                      onValueChange={setEditState}
                      disabled={!crudDescriptor.canUpdate || isCrudPending}
                    >
                      <SelectTrigger
                        id={editStateInputId}
                        size="sm"
                        className="w-full border-gray-200 bg-white shadow-none"
                        aria-label={t("Record state")}
                      >
                        <SelectValue placeholder={t("Record state")} />
                      </SelectTrigger>
                      <SelectContent>
                        {crudDescriptor.stateOptions.map((state) => (
                          <SelectItem key={`${item.id}-${state}`} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={editDetailInputId}
                    className="text-[11px] font-semibold text-gray-500"
                  >
                    {formGuidance?.detailLabel ?? t("Record detail")}
                  </Label>
                  <Textarea
                    id={editDetailInputId}
                    value={editDetail}
                    onChange={(event) => setEditDetail(event.target.value)}
                    disabled={!crudDescriptor.canUpdate || isCrudPending}
                    placeholder={
                      formGuidance?.detailPlaceholder ?? t("Record detail")
                    }
                    className="min-h-16 resize-y border-gray-200 bg-white text-xs shadow-none"
                  />
                  {formGuidance?.detailHelp ? (
                    <p className="text-[11px] leading-4 text-gray-400">
                      {formGuidance.detailHelp}
                    </p>
                  ) : null}
                </div>
                <RecordSpecificFields
                  recordType={item.recordType}
                  values={editFields}
                  onChange={(key, value) =>
                    setEditFields((currentFields) => ({
                      ...currentFields,
                      [key]: value,
                    }))
                  }
                  disabled={!crudDescriptor.canUpdate || isCrudPending}
                  idPrefix={`${item.id}-record-field`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-gray-200 bg-white text-xs shadow-none"
                    disabled={!crudDescriptor.canUpdate || isCrudPending}
                    onClick={handleRecordUpdate}
                  >
                    {isCrudPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    )}
                    {t("Save record")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-red-200 bg-red-50 text-xs text-red-700 shadow-none hover:bg-red-100"
                    disabled={!crudDescriptor.canDelete || isCrudPending}
                    onClick={handleRecordDelete}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {t("Delete record")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {t(crudDescriptor.immutableReason ?? "This record is read-only.")}
              </p>
            )
          ) : (
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {t("No CRUD mapping is configured for this record type.")}
            </p>
          )}
          <div aria-live="polite" className="mt-2 min-h-5">
            {crudError ? (
              <p className="text-xs font-medium text-red-700">{crudError}</p>
            ) : crudFeedback ? (
              <p className="text-xs font-medium text-emerald-700">
                {crudFeedback}
              </p>
            ) : null}
          </div>
        </div>

        <OperatorRecordNotes
          className="mt-0 h-fit"
          moduleKey={item.moduleKey}
          targetType={item.recordType}
          targetId={item.id}
        />
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkTargetState, setBulkTargetState] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null);
  const moduleCreateTypes = operatorModuleCreateOptions[module.key].filter(
    (recordType) => getOperatorRecordCrudDescriptor(recordType)?.canCreate
  );
  const [moduleCreateType, setModuleCreateType] = useState<OperatorRecordCrudType>(
    operatorModuleCreateTargets[module.key]
  );
  const moduleCreateDescriptor =
    getOperatorRecordCrudDescriptor(moduleCreateType);
  const moduleCreateGuidance =
    getOperatorRecordFormGuidance(moduleCreateType);
  const createTitleInputId = `${module.key}-create-record-primary`;
  const createStateInputId = `${module.key}-create-record-state`;
  const createDetailInputId = `${module.key}-create-record-detail`;
  const [createTitle, setCreateTitle] = useState(
    moduleCreateDescriptor ? `${moduleCreateDescriptor.label} draft` : ""
  );
  const [createDetail, setCreateDetail] = useState("");
  const [createFields, setCreateFields] = useState(() =>
    createFieldValues(moduleCreateType)
  );
  const [createState, setCreateState] = useState(
    moduleCreateDescriptor?.defaultState ?? ""
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();
  const [isCreatePending, startCreateTransition] = useTransition();

  const visibleItems = useMemo(
    () =>
      items.filter((item) => savedViewMatchesItem(activeSavedView, item)),
    [activeSavedView, items]
  );
  const transitionableItems = useMemo(
    () =>
      visibleItems.filter((item) => {
        const { transitions, workflow } = getTransitionConfig(item);
        return Boolean(workflow && transitions.length > 0);
      }),
    [visibleItems]
  );
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(item.id)),
    [visibleItems, selectedIds]
  );
  const firstSelectedItem = selectedItems[0];
  const firstSelectedConfig = firstSelectedItem
    ? getTransitionConfig(firstSelectedItem)
    : null;
  const compatibleBulkSelection =
    selectedItems.length > 0 &&
    Boolean(firstSelectedConfig?.workflow) &&
    selectedItems.every((item) => {
      const config = getTransitionConfig(item);
      return (
        config.workflow === firstSelectedConfig?.workflow &&
        item.state === firstSelectedItem?.state &&
        config.transitions.length > 0
      );
    });
  const bulkTransitions = compatibleBulkSelection
    ? firstSelectedConfig?.transitions ?? []
    : [];
  const resolvedBulkTargetState = bulkTransitions.some(
    (transition) => transition.to === bulkTargetState
  )
    ? bulkTargetState
    : bulkTransitions[0]?.to ?? "";
  const allTransitionableSelected =
    transitionableItems.length > 0 &&
    transitionableItems.every((item) => selectedIds.has(item.id));
  const canBulkTransition = Boolean(
    compatibleBulkSelection &&
      firstSelectedConfig?.workflow &&
      resolvedBulkTargetState &&
      selectedItems.length > 0
  );

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
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(itemId);
      return nextIds;
    });
  };

  const handleRecordChanged = (record: OperatorWorkItem) => {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === record.id ? record : item))
    );
  };

  const handleRecordDeleted = (itemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(itemId);
      return nextIds;
    });
  };

  const handleCreateRecord = () => {
    if (!moduleCreateDescriptor?.canCreate) return;

    setCreateError(null);
    setCreateFeedback(null);

    startCreateTransition(async () => {
      const result = await createOperatorRecord({
        moduleKey: module.key,
        recordType: moduleCreateType,
        title: createTitle,
        detail: createDetail,
        state: createState,
        fields: createFields,
      });

      if ("error" in result) {
        setCreateError(result.error);
        return;
      }

      if ("record" in result) {
        setItems((currentItems) => [result.record, ...currentItems]);
        setCreateTitle(`${moduleCreateDescriptor.label} draft`);
        setCreateDetail("");
        setCreateFields(createFieldValues(moduleCreateType));
        setCreateState(moduleCreateDescriptor.defaultState);
        setCreateFeedback(t("Record created and audit event recorded."));
      }
    });
  };

  const handleCreateTypeChange = (recordType: string) => {
    const descriptor = getOperatorRecordCrudDescriptor(recordType);
    if (!descriptor?.canCreate) return;

    setModuleCreateType(recordType as OperatorRecordCrudType);
    setCreateTitle(`${descriptor.label} draft`);
    setCreateDetail("");
    setCreateFields(createFieldValues(recordType));
    setCreateState(descriptor.defaultState);
    setCreateError(null);
    setCreateFeedback(null);
  };

  const handleSelectedChange = (itemId: string, selected: boolean) => {
    setBulkError(null);
    setBulkFeedback(null);
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (selected) {
        nextIds.add(itemId);
      } else {
        nextIds.delete(itemId);
      }
      return nextIds;
    });
  };

  const handleSelectAllTransitionable = (selected: boolean) => {
    setBulkError(null);
    setBulkFeedback(null);
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const item of transitionableItems) {
        if (selected) {
          nextIds.add(item.id);
        } else {
          nextIds.delete(item.id);
        }
      }
      return nextIds;
    });
  };

  const handleSavedViewChange = (view: string | null) => {
    setActiveSavedView(view);
    setBulkError(null);
    setBulkFeedback(null);
    setSelectedIds(new Set());
  };

  const handleQueueKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      isEditableKeyboardTarget(event.target) ||
      (event.key !== "ArrowDown" && event.key !== "ArrowUp")
    ) {
      return;
    }

    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-work-queue-row]")
    );
    const currentRow = rows.find((row) => row === event.target);

    if (!currentRow) {
      return;
    }

    const currentIndex = rows.indexOf(currentRow);
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(rows.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);

    event.preventDefault();
    rows[nextIndex]?.focus();
  };

  const handleBulkTransition = () => {
    if (!canBulkTransition || !firstSelectedConfig?.workflow) return;

    const confirmed = window.confirm(
      `${t("Apply bulk transition")} (${selectedItems.length} ${t("records")})?`
    );

    if (!confirmed) return;

    setBulkError(null);
    setBulkFeedback(null);

    startBulkTransition(async () => {
      const results = [];

      for (const item of selectedItems) {
        const result = await transitionOperatorWorkflow({
          workflow: firstSelectedConfig.workflow,
          targetId: item.id,
          fromState: item.state,
          toState: resolvedBulkTargetState,
          reason: bulkReason.trim() || undefined,
        });

        if ("error" in result) {
          setBulkError(result.error);
          return;
        }

        results.push(result);
      }

      const transitionedIds = new Set(selectedItems.map((item) => item.id));
      setItems((currentItems) =>
        currentItems.map((item) =>
          transitionedIds.has(item.id)
            ? {
                ...item,
                state: resolvedBulkTargetState,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );
      setSelectedIds((currentIds) => {
        const nextIds = new Set(currentIds);
        for (const itemId of transitionedIds) {
          nextIds.delete(itemId);
        }
        return nextIds;
      });
      setBulkReason("");
      setBulkFeedback(
        results.some((result) => result.persisted)
          ? t("State updated and audit event recorded.")
          : t("State preview updated in fixture mode.")
      );
    });
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
            <button
              type="button"
              onClick={() => handleSavedViewChange(null)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                activeSavedView
                  ? "border-gray-200 bg-gray-50 text-gray-600"
                  : "border-gray-950 bg-gray-950 text-white"
              )}
            >
              {t("All")} ({items.length})
            </button>
            {module.savedViews.map((view, index) => (
              <button
                key={view}
                type="button"
                onClick={() => handleSavedViewChange(view)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  activeSavedView === view
                    ? "border-gray-950 bg-gray-950 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                )}
              >
                {t(view)} / {savedViewScope(index)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-b border-gray-100 bg-gray-50/70 p-4">
        <div className="grid gap-3 xl:grid-cols-2 xl:items-stretch">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
              <Plus className="h-3.5 w-3.5 text-gray-400" />
              {t("Create record")}
            </div>
            {moduleCreateDescriptor?.canCreate ? (
              <div className="mt-3 grid gap-2">
                {moduleCreateTypes.length > 1 ? (
                  <Select
                    value={moduleCreateType}
                    onValueChange={handleCreateTypeChange}
                    disabled={isCreatePending}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full border-gray-200 bg-white shadow-none"
                      aria-label={t("Record type")}
                    >
                      <SelectValue placeholder={t("Record type")} />
                    </SelectTrigger>
                    <SelectContent>
                      {moduleCreateTypes.map((recordType) => {
                        const descriptor =
                          getOperatorRecordCrudDescriptor(recordType);
                        return descriptor ? (
                          <SelectItem key={`${module.key}-${recordType}`} value={recordType}>
                            {t(descriptor.label)}
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectContent>
                  </Select>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_0.7fr]">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={createTitleInputId}
                      className="text-[11px] font-semibold text-gray-500"
                    >
                      {moduleCreateGuidance?.primaryLabel ?? t("Record title")}
                    </Label>
                    <Input
                      id={createTitleInputId}
                      value={createTitle}
                      onChange={(event) => setCreateTitle(event.target.value)}
                      disabled={isCreatePending}
                      placeholder={
                        moduleCreateGuidance?.primaryPlaceholder ??
                        t("Record title")
                      }
                      className="h-8 border-gray-200 bg-white text-xs shadow-none"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={createStateInputId}
                      className="text-[11px] font-semibold text-gray-500"
                    >
                      {t("Record state")}
                    </Label>
                    <Select
                      value={createState}
                      onValueChange={setCreateState}
                      disabled={isCreatePending}
                    >
                      <SelectTrigger
                        id={createStateInputId}
                        size="sm"
                        className="w-full border-gray-200 bg-white shadow-none"
                        aria-label={t("Record state")}
                      >
                        <SelectValue placeholder={t("Record state")} />
                      </SelectTrigger>
                      <SelectContent>
                        {moduleCreateDescriptor.stateOptions.map((state) => (
                          <SelectItem key={`${module.key}-${state}`} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={createDetailInputId}
                    className="text-[11px] font-semibold text-gray-500"
                  >
                    {moduleCreateGuidance?.detailLabel ?? t("Record detail")}
                  </Label>
                  <Textarea
                    id={createDetailInputId}
                    value={createDetail}
                    onChange={(event) => setCreateDetail(event.target.value)}
                    disabled={isCreatePending}
                    placeholder={
                      moduleCreateGuidance?.detailPlaceholder ??
                      t("Record detail")
                    }
                    className="min-h-16 resize-y border-gray-200 bg-white text-xs shadow-none"
                  />
                  {moduleCreateGuidance ? (
                    <p className="text-[11px] leading-4 text-gray-400">
                      {moduleCreateGuidance.createHelp ??
                        moduleCreateGuidance.detailHelp}
                    </p>
                  ) : null}
                </div>
                <RecordSpecificFields
                  recordType={moduleCreateType}
                  values={createFields}
                  onChange={(key, value) =>
                    setCreateFields((currentFields) => ({
                      ...currentFields,
                      [key]: value,
                    }))
                  }
                  disabled={isCreatePending}
                  idPrefix={`${module.key}-create-record-field`}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-fit bg-gray-950 text-xs text-white shadow-none hover:bg-gray-800"
                  disabled={isCreatePending}
                  onClick={handleCreateRecord}
                >
                  {isCreatePending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-3.5 w-3.5" />
                  )}
                  {t("Create")} {t(moduleCreateDescriptor.label)}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {t(
                  moduleCreateDescriptor?.immutableReason ??
                    "Creation for this module is handled by a specialized workflow."
                )}
              </p>
            )}
            <div aria-live="polite" className="mt-2 min-h-5">
              {createError ? (
                <p className="text-xs font-medium text-red-700">{createError}</p>
              ) : createFeedback ? (
                <p className="text-xs font-medium text-emerald-700">
                  {createFeedback}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                aria-label={t("Select all transitionable records")}
                checked={
                  allTransitionableSelected
                    ? true
                    : selectedItems.length > 0
                      ? "indeterminate"
                      : false
                }
                disabled={transitionableItems.length === 0 || isBulkPending}
                onCheckedChange={(checked) => {
                  handleSelectAllTransitionable(checked === true);
                }}
                className="border-gray-300 data-[state=checked]:border-gray-950 data-[state=checked]:bg-gray-950"
              />
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
                  <ListChecks className="h-3.5 w-3.5 text-gray-400" />
                  {t("Bulk transition")}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedItems.length} {t("selected")} /{" "}
                  {transitionableItems.length} {t("records")}
                </p>
              </div>
              {selectedItems.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-gray-200 bg-white text-xs shadow-none"
                  disabled={isBulkPending}
                  onClick={() => setSelectedIds(new Set())}
                >
                  {t("Clear")}
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[0.7fr_1fr_auto]">
              <Select
                value={resolvedBulkTargetState}
                onValueChange={setBulkTargetState}
                disabled={!compatibleBulkSelection || isBulkPending}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full border-gray-200 bg-white shadow-none"
                  aria-label={t("Next state")}
                >
                  <SelectValue placeholder={t("Next state")} />
                </SelectTrigger>
                <SelectContent>
                  {bulkTransitions.map((transition) => (
                    <SelectItem
                      key={`bulk-${transition.from}-${transition.to}`}
                      value={transition.to}
                    >
                      {transition.to}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={bulkReason}
                onChange={(event) => setBulkReason(event.target.value)}
                disabled={!compatibleBulkSelection || isBulkPending}
                placeholder={t("Transition reason")}
                className="h-8 border-gray-200 bg-white text-xs shadow-none"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 bg-gray-950 text-xs text-white shadow-none hover:bg-gray-800"
                disabled={!canBulkTransition || isBulkPending}
                onClick={handleBulkTransition}
              >
                {isBulkPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                )}
                {t("Apply bulk transition")}
              </Button>
            </div>

            <div aria-live="polite" className="mt-2 min-h-5">
              {bulkError ? (
                <p className="text-xs font-medium text-red-700">{bulkError}</p>
              ) : bulkFeedback ? (
                <p className="text-xs font-medium text-emerald-700">{bulkFeedback}</p>
              ) : selectedItems.length > 0 && !compatibleBulkSelection ? (
                <p className="text-xs font-medium text-amber-700">
                  {t("Select rows with the same workflow and state.")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="p-5" onKeyDown={handleQueueKeyDown}>
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => {
            const selectable = transitionableItems.some(
              (transitionableItem) => transitionableItem.id === item.id
            );

            return (
              <WorkItemRow
                key={`${item.moduleKey}-${item.recordType}-${item.id}`}
                item={item}
                selectable={selectable}
                selected={selectedIds.has(item.id)}
                onSelectedChange={handleSelectedChange}
                onTransitioned={handleTransitioned}
                onRecordChanged={handleRecordChanged}
                onRecordDeleted={handleRecordDeleted}
              />
            );
          })
        ) : (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
            {t("No records need operator attention in this module.")}
          </div>
        )}
      </div>
    </section>
  );
}
