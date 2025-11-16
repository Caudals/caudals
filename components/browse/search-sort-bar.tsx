"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortOption, DatasetFilters } from "@/types/dataset";
import { FiltersPopover } from "./filters-popover";
import { useTranslations } from "@/lib/i18n/use-translations";

interface SearchSortBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  resultCount: number;
  totalCount: number;
  filters: DatasetFilters;
  onFiltersChange: (filters: DatasetFilters) => void;
  onClearFilters: () => void;
}

export function SearchSortBar({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  resultCount,
  totalCount,
  filters,
  onFiltersChange,
  onClearFilters,
}: SearchSortBarProps) {
  const t = useTranslations();
  const baseFilterCount =
    filters.categories.length +
    filters.dataTypes.length +
    filters.status.length +
    (filters.rewardRange[0] > 0 || filters.rewardRange[1] < 150 ? 1 : 0);

  const hasSearch = search.trim().length > 0;
  const hasActiveFilters = baseFilterCount > 0 || hasSearch;
  const filterBadgeCount = baseFilterCount + (hasSearch ? 1 : 0);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("Search organizations or requests")}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 rounded-xl border-border/80 pl-11 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FiltersPopover
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClearFilters={onClearFilters}
          />

          <Select
            value={sortBy}
            onValueChange={(value) => onSortChange(value as SortOption)}
          >
            <SelectTrigger className="h-11 w-[170px] rounded-xl border-border/80 text-sm">
              <SelectValue placeholder={t("Sort by")} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">{t("Newest")}</SelectItem>
              <SelectItem value="oldest">{t("Oldest")}</SelectItem>
              <SelectItem value="highest-reward">{t("Highest reward")}</SelectItem>
              <SelectItem value="lowest-reward">{t("Lowest reward")}</SelectItem>
              <SelectItem value="most-popular">{t("Most popular")}</SelectItem>
              <SelectItem value="closing-soon">{t("Closing soon")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {t("{{result}} of {{total}} requests", {
              result: resultCount.toLocaleString(),
              total: totalCount.toLocaleString(),
            })}
          </span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {t(
                filterBadgeCount === 1 ? "{{count}} filter" : "{{count}} filters",
                { count: filterBadgeCount },
              )}
            </Badge>
          )}
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={onClearFilters}
          >
            {t("Clear all")}
          </Button>
        )}
      </div>
    </div>
  );
}
