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
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-10 pl-10 text-sm"
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
            <SelectTrigger className="h-10 w-[170px] text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="highest-reward">Highest reward</SelectItem>
              <SelectItem value="lowest-reward">Lowest reward</SelectItem>
              <SelectItem value="most-popular">Most popular</SelectItem>
              <SelectItem value="closing-soon">Closing soon</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            <span className="font-semibold text-foreground">{resultCount}</span>{" "}
            of{" "}
            <span className="font-semibold text-foreground">{totalCount}</span>{" "}
            requests
          </span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs">
              {filterBadgeCount} filter{filterBadgeCount === 1 ? "" : "s"}
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
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
