"use client";

import {
  DatasetFilters,
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import { X, SlidersHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "@/lib/i18n/use-translations";

interface FiltersSidebarProps {
  filters: DatasetFilters;
  onFiltersChange: (filters: DatasetFilters) => void;
  onClearFilters: () => void;
  isOpen?: boolean;
}

export function FiltersSidebar({
  filters,
  onFiltersChange,
  onClearFilters,
  isOpen = true,
}: FiltersSidebarProps) {
  const t = useTranslations();
  const categories: DatasetCategory[] = [
    "computer-vision",
    "natural-language",
    "speech-audio",
    "healthcare",
    "robotics",
    "other",
  ];

  const dataTypes: DataType[] = ["image", "video", "audio", "text", "mixed"];

  const statuses: DatasetStatus[] = [
    "active",
    "closing-soon",
    "completed",
    "paused",
  ];

  const toggleCategory = (category: DatasetCategory) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const toggleDataType = (dataType: DataType) => {
    const newDataTypes = filters.dataTypes.includes(dataType)
      ? filters.dataTypes.filter((dt) => dt !== dataType)
      : [...filters.dataTypes, dataType];
    onFiltersChange({ ...filters, dataTypes: newDataTypes });
  };

  const toggleStatus = (status: DatasetStatus) => {
    const newStatuses = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatuses });
  };

  const handleRewardRangeChange = (value: number[]) => {
    onFiltersChange({ ...filters, rewardRange: [value[0], value[1]] });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.dataTypes.length > 0 ||
    filters.status.length > 0 ||
    filters.rewardRange[0] > 0 ||
    filters.rewardRange[1] < 150;

  if (!isOpen) return null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("Filters")}</h2>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 text-xs"
          >
            <X className="mr-1 h-3 w-3" />
            {t("Clear all")}
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-12rem)]">
        <div className="space-y-6 pr-4">
          {/* Category Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">{t("Category")}</Label>
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${category}`}
                    checked={filters.categories.includes(category)}
                    onCheckedChange={() => toggleCategory(category)}
                  />
                  <label
                    htmlFor={`category-${category}`}
                    className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t(categoryLabels[category])}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Data Type Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">{t("Data type")}</Label>
            <div className="space-y-2">
              {dataTypes.map((dataType) => (
                <div key={dataType} className="flex items-center space-x-2">
                  <Checkbox
                    id={`datatype-${dataType}`}
                    checked={filters.dataTypes.includes(dataType)}
                    onCheckedChange={() => toggleDataType(dataType)}
                  />
                  <label
                    htmlFor={`datatype-${dataType}`}
                    className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t(dataTypeLabels[dataType])}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Reward Range Slider */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">{t("Reward range (USD)")}</Label>
            <div className="space-y-4 pt-2">
              <Slider
                min={0}
                max={150}
                step={5}
                value={filters.rewardRange}
                onValueChange={handleRewardRangeChange}
                className="w-full"
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>${filters.rewardRange[0]}</span>
                <span>${filters.rewardRange[1]}+</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Status Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">{t("Status")}</Label>
            <div className="space-y-2">
              {statuses.map((status) => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={filters.status.includes(status)}
                    onCheckedChange={() => toggleStatus(status)}
                  />
                  <label
                    htmlFor={`status-${status}`}
                    className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t(statusLabels[status])}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
