"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import { statusLabels } from "@/lib/data/datasets";
import {
  AdminDatasetUpdates,
  adminBulkUpdateDatasetRequests,
} from "@/lib/actions/admin-actions";
import { DatasetStatus } from "@/types/dataset";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

type ToggleField<T> = {
  enabled: boolean;
  value: T;
};

interface FormState {
  status: ToggleField<DatasetStatus | "">;
  rewardAmount: ToggleField<string>;
  samplesNeeded: ToggleField<string>;
  deadline: ToggleField<string>;
  currency: ToggleField<string>;
  featured: ToggleField<boolean>;
}

const createDefaultState = (): FormState => ({
  status: { enabled: false, value: "" },
  rewardAmount: { enabled: false, value: "" },
  samplesNeeded: { enabled: false, value: "" },
  deadline: { enabled: false, value: "" },
  currency: { enabled: false, value: "" },
  featured: { enabled: false, value: false },
});

interface BulkDatasetEditDialogProps {
  open: boolean;
  selectedCount: number;
  selectedIds: string[];
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function BulkDatasetEditDialog({
  open,
  selectedCount,
  selectedIds,
  onOpenChange,
  onComplete,
}: BulkDatasetEditDialogProps) {
  const [formState, setFormState] = useState<FormState>(createDefaultState);
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();

  useEffect(() => {
    if (!open) {
      setFormState(createDefaultState());
    }
  }, [open]);

  const selectedStatusOptions = useMemo(
    () => Object.keys(statusLabels) as DatasetStatus[],
    []
  );

  const toggleField = <K extends keyof FormState>(
    key: K,
    enabled: boolean
  ) => {
    setFormState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled,
      },
    }));
  };

  const updateFieldValue = <K extends keyof FormState, V extends FormState[K]["value"]>(
    key: K,
    value: V
  ) => {
    setFormState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value,
      },
    }));
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one dataset to update.");
      return;
    }

    const updates: AdminDatasetUpdates = {};

    if (formState.status.enabled) {
      if (!formState.status.value) {
        toast.error("Select a dataset status.");
        return;
      }
      updates.status = formState.status.value as DatasetStatus;
    }

    if (formState.rewardAmount.enabled) {
      const reward = Number(formState.rewardAmount.value);
      if (Number.isNaN(reward)) {
        toast.error("Enter a valid reward amount.");
        return;
      }
      updates.reward_amount = reward;
    }

    if (formState.samplesNeeded.enabled) {
      const samples = Number(formState.samplesNeeded.value);
      if (!Number.isInteger(samples) || samples < 0) {
        toast.error("Samples needed must be a positive integer.");
        return;
      }
      updates.samples_needed = samples;
    }

    if (formState.deadline.enabled) {
      if (!formState.deadline.value) {
        toast.error("Select a deadline date.");
        return;
      }
      updates.deadline = formState.deadline.value;
    }

    if (formState.currency.enabled) {
      if (!formState.currency.value) {
        toast.error("Currency cannot be empty.");
        return;
      }
      updates.currency = formState.currency.value.toUpperCase();
    }

    if (formState.featured.enabled) {
      updates.featured = formState.featured.value;
    }

    if (Object.keys(updates).length === 0) {
      toast.error("Select at least one field to update.");
      return;
    }

    startTransition(async () => {
      const result = await adminBulkUpdateDatasetRequests(
        selectedIds,
        updates
      );

      if ("error" in result) {
        toast.error(result.error || "Unable to update datasets.");
        return;
      }

      toast.success(
        `Applied updates to ${selectedCount} dataset${selectedCount === 1 ? "" : "s"}.`
      );
      onOpenChange(false);
      onComplete();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk edit datasets</DialogTitle>
          <DialogDescription>
            Apply the selected changes to {selectedCount} dataset
            {selectedCount === 1 ? "" : "s"}. Fields you leave disabled will
            remain untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-status"
                checked={formState.status.enabled}
                onCheckedChange={(checked) =>
                  toggleField("status", Boolean(checked))
                }
                aria-describedby="bulk-status-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <Label htmlFor="bulk-status">Dataset status</Label>
                  <p
                    id="bulk-status-description"
                    className="text-sm text-muted-foreground"
                  >
                    Update the lifecycle badge shown to contributors.
                  </p>
                </div>
                <Select
                  value={formState.status.value}
                  onValueChange={(value) =>
                    updateFieldValue(
                      "status",
                      value as DatasetStatus | ""
                    )
                  }
                  disabled={!formState.status.enabled || isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose status" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-reward"
                checked={formState.rewardAmount.enabled}
                onCheckedChange={(checked) =>
                  toggleField("rewardAmount", Boolean(checked))
                }
                aria-describedby="bulk-reward-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <Label htmlFor="bulk-reward-value">Reward amount</Label>
                  <p
                    id="bulk-reward-description"
                    className="text-sm text-muted-foreground"
                  >
                    Set a new base reward for each approved contribution.
                  </p>
                </div>
                <Input
                  id="bulk-reward-value"
                  type="number"
                  placeholder="e.g. 5.00"
                  value={formState.rewardAmount.value}
                  onChange={(event) =>
                    updateFieldValue("rewardAmount", event.target.value)
                  }
                  disabled={!formState.rewardAmount.enabled || isPending}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-samples"
                checked={formState.samplesNeeded.enabled}
                onCheckedChange={(checked) =>
                  toggleField("samplesNeeded", Boolean(checked))
                }
                aria-describedby="bulk-samples-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <Label htmlFor="bulk-samples-value">Samples needed</Label>
                  <p
                    id="bulk-samples-description"
                    className="text-sm text-muted-foreground"
                  >
                    Adjust the remaining quota shown to contributors.
                  </p>
                </div>
                <Input
                  id="bulk-samples-value"
                  type="number"
                  placeholder="e.g. 500"
                  value={formState.samplesNeeded.value}
                  onChange={(event) =>
                    updateFieldValue("samplesNeeded", event.target.value)
                  }
                  disabled={!formState.samplesNeeded.enabled || isPending}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-deadline"
                checked={formState.deadline.enabled}
                onCheckedChange={(checked) =>
                  toggleField("deadline", Boolean(checked))
                }
                aria-describedby="bulk-deadline-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <Label htmlFor="bulk-deadline-value">Deadline</Label>
                  <p
                    id="bulk-deadline-description"
                    className="text-sm text-muted-foreground"
                  >
                    Ensure the collection window is accurate across requests.
                  </p>
                </div>
                <Input
                  id="bulk-deadline-value"
                  type="date"
                  value={formState.deadline.value}
                  onChange={(event) =>
                    updateFieldValue("deadline", event.target.value)
                  }
                  disabled={!formState.deadline.enabled || isPending}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-currency"
                checked={formState.currency.enabled}
                onCheckedChange={(checked) =>
                  toggleField("currency", Boolean(checked))
                }
                aria-describedby="bulk-currency-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <Label htmlFor="bulk-currency-value">Currency</Label>
                  <p
                    id="bulk-currency-description"
                    className="text-sm text-muted-foreground"
                  >
                    Provide a three-letter ISO code (USD, EUR, GBP, etc.).
                  </p>
                </div>
                <Input
                  id="bulk-currency-value"
                  placeholder="USD"
                  value={formState.currency.value}
                  onChange={(event) =>
                    updateFieldValue("currency", event.target.value)
                  }
                  disabled={!formState.currency.enabled || isPending}
                  maxLength={6}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="bulk-featured"
                checked={formState.featured.enabled}
                onCheckedChange={(checked) =>
                  toggleField("featured", Boolean(checked))
                }
                aria-describedby="bulk-featured-description"
                disabled={isPending}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="bulk-featured-value">Featured spotlight</Label>
                    <p
                      id="bulk-featured-description"
                      className="text-sm text-muted-foreground"
                    >
                      Toggle homepage promotion for these datasets.
                    </p>
                  </div>
                  <Switch
                    id="bulk-featured-value"
                    checked={formState.featured.value}
                    onCheckedChange={(checked) =>
                      updateFieldValue("featured", checked)
                    }
                    disabled={!formState.featured.enabled || isPending}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving changes..." : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
