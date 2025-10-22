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
import { SortOption, DatasetFilters } from "@/types/dataset";
import { FiltersPopover } from "./filters-popover";

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
  const baseFilterCount =
    filters.categories.length +
    filters.dataTypes.length +
    filters.status.length +
    (filters.rewardRange[0] > 0 || filters.rewardRange[1] < 150 ? 1 : 0);

  const hasSearch = search.trim().length > 0;
  const hasActiveFilters = baseFilterCount > 0 || hasSearch;
  const filterBadgeCount = baseFilterCount + (hasSearch ? 1 : 0);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title, organization, or keywords"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-12 rounded-full border-border/60 bg-background/80 pl-12 text-sm shadow-inner"
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
            <SelectTrigger className="h-12 w-[190px] rounded-full border-border/60 bg-background/80 text-sm">
              <SelectValue placeholder="Sort datasets" />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[200px]">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="highest-reward">Highest reward</SelectItem>
              <SelectItem value="lowest-reward">Lowest reward</SelectItem>
              <SelectItem value="most-popular">Most contributors</SelectItem>
              <SelectItem value="closing-soon">Closing soon</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Showing <span className="font-semibold text-foreground">{resultCount}</span> of{" "}
            <span className="font-semibold text-foreground">{totalCount}</span> dataset requests
          </span>
          {hasActiveFilters && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              {filterBadgeCount} active filter
              {filterBadgeCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start rounded-full px-3 py-1 text-xs sm:self-auto"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        ) : (
          <span className="text-xs italic text-muted-foreground">
            Tip: combine filters to refine your feed.
          </span>
        )}
      </div>
    </div>
  );
}
