"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
import { createRequesterDataset, updateRequesterDataset } from "@/lib/actions/requester-actions";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

const CATEGORY_OPTIONS = [
  { value: "computer-vision", label: "Computer Vision" },
  { value: "natural-language", label: "Natural Language" },
  { value: "speech-audio", label: "Speech & Audio" },
  { value: "healthcare", label: "Healthcare" },
  { value: "robotics", label: "Robotics" },
  { value: "other", label: "Other" },
] as const;

const DATA_TYPE_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text" },
  { value: "mixed", label: "Mixed" },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]["value"];
type DataTypeValue = (typeof DATA_TYPE_OPTIONS)[number]["value"];

const CATEGORY_VALUES = new Set<CategoryValue>(
  CATEGORY_OPTIONS.map((option) => option.value)
);
const DATA_TYPE_VALUES = new Set<DataTypeValue>(
  DATA_TYPE_OPTIONS.map((option) => option.value)
);

export type DuplicateDataset = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  reward_amount?: number | null;
  data_type?: string | null;
  samples_needed?: number | null;
  samples_collected?: number | null;
  currency?: string | null;
  deadline?: string | null;
  image_url?: string | null;
  quality_criteria?: string[];
  requirements?: string[];
};

type BuilderTemplate = {
  id: string;
  title: string;
  category?: string;
  data_type?: string;
  prompt?: string;
};

type DatasetBuilderProps = {
  templates?: BuilderTemplate[];
  duplicate?: DuplicateDataset;
  datasetId?: string;
};

function toMultiline(value: string[] | undefined) {
  return (value ?? []).join("\n");
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getTodayPlusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function DatasetBuilder({
  templates = [],
  duplicate,
  datasetId,
}: DatasetBuilderProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const [templateId, setTemplateId] = useState<string>(duplicate ? "duplicate" : "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [form, setForm] = useState(() => ({
    title: duplicate?.title ?? "",
    description: duplicate?.description ?? "",
    category: (duplicate?.category as CategoryValue) ?? "other",
    dataType: (duplicate?.data_type as DataTypeValue) ?? "text",
    samplesNeeded: duplicate?.samples_needed ? String(duplicate.samples_needed) : "100",
    rewardAmount: duplicate?.reward_amount ? String(duplicate.reward_amount) : "2",
    currency: duplicate?.currency ?? "USD",
    deadline: duplicate?.deadline ?? getTodayPlusDays(14),
    imageUrl: duplicate?.image_url ?? "",
    qualityCriteria: toMultiline(duplicate?.quality_criteria),
    requirements: toMultiline(duplicate?.requirements),
  }));

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates]
  );

  const applyTemplate = () => {
    if (!selectedTemplate) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      title: prev.title || selectedTemplate.title,
      description: prev.description || selectedTemplate.prompt || "",
      category:
        (selectedTemplate.category as CategoryValue) ?? prev.category ?? "other",
      dataType:
        (selectedTemplate.data_type as DataTypeValue) ?? prev.dataType ?? "text",
    }));
    toast.success(t("Template applied"));
  };

  const submit = (publish: boolean) => {
    setError(null);
    setFieldErrors(null);

    if (!form.title.trim()) {
      setError(t("Title is required") ?? "Title is required");
      return;
    }

    if (!form.description.trim()) {
      setError(t("Description is required") ?? "Description is required");
      return;
    }

    if (!form.deadline || Number.isNaN(Date.parse(form.deadline))) {
      setError(
        t("Deadline must be a valid date") ?? "Deadline must be a valid date"
      );
      return;
    }

    startTransition(async () => {
      const normalizedCategory = CATEGORY_VALUES.has(form.category)
        ? form.category
        : "other";
      const normalizedDataType = DATA_TYPE_VALUES.has(form.dataType)
        ? form.dataType
        : "text";

      const payload = {
        title: form.title,
        description: form.description,
        category: normalizedCategory,
        dataType: normalizedDataType,
        samplesNeeded: form.samplesNeeded,
        rewardAmount: form.rewardAmount,
        currency: form.currency.toUpperCase(),
        deadline: form.deadline,
        imageUrl: form.imageUrl,
        qualityCriteria: splitLines(form.qualityCriteria),
        requirements: splitLines(form.requirements),
        publish,
      };

      const result = datasetId
        ? await updateRequesterDataset({ ...payload, datasetId })
        : await createRequesterDataset(payload);

      if ("error" in result) {
        const message = result.error ?? "Unable to save dataset";
        setError(message);
        setFieldErrors(result.fieldErrors ?? null);
        toast.error(message);
        return;
      }

      await trackFunnelEvent("funnel_dataset_created", {
        publish,
        mode: datasetId ? "edit" : duplicate ? "duplicate" : "create",
        dataset_id: result.id,
      });

      toast.success(
        publish
          ? t("Dataset submitted for review")
          : t("Draft saved")
      );
      router.push(`/requester/datasets/${result.id}`);
      router.refresh();
    });
  };

  const estimatedBudget =
    (Number(form.samplesNeeded) || 0) * (Number(form.rewardAmount) || 0);

  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-sm border border-border">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">
              {datasetId ? "Edit dataset brief" : duplicate ? "Duplicate dataset brief" : "Dataset builder"}
            </CardTitle>
            <Badge variant="outline">{datasetId ? "Editing" : "New brief"}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <div>
              <Label>{t("Template")}</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("Select a template")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              onClick={applyTemplate}
              disabled={!selectedTemplate || isPending}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("Apply")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="bg-white shadow-sm border border-border">
        <CardContent className="grid gap-6 p-6">
          <div className="space-y-2">
            <Label>{t("Title")}</Label>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder={t("Medical image annotation for chest X-rays")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("Description")}</Label>
            <Textarea
              rows={5}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder={t("Describe the goal, labeling standards, and acceptance criteria.")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("Category")}</Label>
              <Select
                value={form.category}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, category: value as CategoryValue }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Data type")}</Label>
              <Select
                value={form.dataType}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, dataType: value as DataTypeValue }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>{t("Samples needed")}</Label>
              <Input
                type="number"
                min={1}
                value={form.samplesNeeded}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, samplesNeeded: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Reward per sample")}</Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={form.rewardAmount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rewardAmount: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Currency")}</Label>
              <Input
                maxLength={3}
                value={form.currency}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Deadline")}</Label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deadline: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("Cover image URL")}</Label>
            <Input
              value={form.imageUrl}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, imageUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("Quality criteria (one per line)")}</Label>
              <Textarea
                rows={6}
                value={form.qualityCriteria}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    qualityCriteria: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Requirements (one per line)")}</Label>
              <Textarea
                rows={6}
                value={form.requirements}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    requirements: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm border border-border">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-muted-foreground">{t("Estimated budget")}</p>
            <p className="text-2xl font-semibold">
              {form.currency.toUpperCase()} {estimatedBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => submit(false)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Save draft")}
            </Button>
            <Button disabled={isPending} onClick={() => submit(true)}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Submit for review")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{error}</p>
          {fieldErrors ? (
            <ul className="list-inside list-disc space-y-1 text-xs">
              {Object.entries(fieldErrors).flatMap(([field, messages]) =>
                messages.map((message, index) => (
                  <li key={`${field}-${index}`}>
                    {field}: {message}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
