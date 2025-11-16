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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import { SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "@/lib/i18n/use-translations";

interface FiltersPopoverProps {
  filters: DatasetFilters;
  onFiltersChange: (filters: DatasetFilters) => void;
  onClearFilters: () => void;
}

export function FiltersPopover({
  filters,
  onFiltersChange,
  onClearFilters,
}: FiltersPopoverProps) {
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

  const activeFilterCount =
    filters.categories.length +
    filters.dataTypes.length +
    filters.status.length +
    (filters.rewardRange[0] > 0 || filters.rewardRange[1] < 150 ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {t("Filters")}
          {hasActiveFilters && (
            <Badge
              variant="secondary"
              className="ml-1 rounded-full px-1.5 py-0.5 text-xs"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{t("Filters")}</h4>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-auto px-2 py-1 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                {t("Clear")}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {/* Category Filters */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("Category")}
                </Label>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pop-category-${category}`}
                        checked={filters.categories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                      />
                      <label
                        htmlFor={`pop-category-${category}`}
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
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("Data type")}
                </Label>
                <div className="space-y-2">
                  {dataTypes.map((dataType) => (
                    <div key={dataType} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pop-datatype-${dataType}`}
                        checked={filters.dataTypes.includes(dataType)}
                        onCheckedChange={() => toggleDataType(dataType)}
                      />
                      <label
                        htmlFor={`pop-datatype-${dataType}`}
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
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("Reward range (USD)")}
                </Label>
                <div className="space-y-4 pt-2">
                  <Slider
                    min={0}
                    max={150}
                    step={5}
                    value={filters.rewardRange}
                    onValueChange={handleRewardRangeChange}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>${filters.rewardRange[0]}</span>
                    <span>${filters.rewardRange[1]}+</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Status Filters */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("Status")}
                </Label>
                <div className="space-y-2">
                  {statuses.map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pop-status-${status}`}
                        checked={filters.status.includes(status)}
                        onCheckedChange={() => toggleStatus(status)}
                      />
                      <label
                        htmlFor={`pop-status-${status}`}
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
      </PopoverContent>
    </Popover>
  );
}
