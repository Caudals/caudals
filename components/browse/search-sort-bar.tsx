"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Grid3x3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortOption, DatasetFilters } from "@/types/dataset";
import { FiltersPopover } from "./filters-popover";

interface SearchSortBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
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
  viewMode,
  onViewModeChange,
  resultCount,
  totalCount,
  filters,
  onFiltersChange,
  onClearFilters,
}: SearchSortBarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <FiltersPopover
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClearFilters={onClearFilters}
          />

          <Select
            value={sortBy}
            onValueChange={(value) => onSortChange(value as SortOption)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="highest-reward">Highest Reward</SelectItem>
              <SelectItem value="lowest-reward">Lowest Reward</SelectItem>
              <SelectItem value="most-popular">Most Popular</SelectItem>
              <SelectItem value="closing-soon">Closing Soon</SelectItem>
            </SelectContent>
          </Select>

          <div className="hidden sm:flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewModeChange("grid")}
            >
              <Grid3x3 className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewModeChange("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">List view</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Showing{" "}
          <span className="font-medium text-foreground">{resultCount}</span> of{" "}
          <span className="font-medium text-foreground">{totalCount}</span>{" "}
          datasets
        </p>
      </div>
    </div>
  );
}
