"use client";

import { useState, useMemo } from "react";
import { DatasetCardImproved } from "@/components/browse/dataset-card-improved";
import { SearchSortBar } from "@/components/browse/search-sort-bar";
import { Dataset, DatasetFilters, SortOption } from "@/types/dataset";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";

interface BrowseClientProps {
  initialDatasets: Dataset[];
}

export function BrowseClient({ initialDatasets }: BrowseClientProps) {
  const [filters, setFilters] = useState<DatasetFilters>({
    search: "",
    categories: [],
    dataTypes: [],
    rewardRange: [0, 150],
    status: [],
  });

  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const clearFilters = () => {
    setFilters({
      search: "",
      categories: [],
      dataTypes: [],
      rewardRange: [0, 150],
      status: [],
    });
  };

  // Filter datasets
  const filteredDatasets = useMemo(() => {
    return initialDatasets.filter((dataset) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          dataset.title.toLowerCase().includes(searchLower) ||
          dataset.description.toLowerCase().includes(searchLower) ||
          dataset.organization.name.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (filters.categories.length > 0) {
        if (!filters.categories.includes(dataset.category)) return false;
      }

      // Data type filter
      if (filters.dataTypes.length > 0) {
        if (!filters.dataTypes.includes(dataset.dataType)) return false;
      }

      // Reward range filter
      if (
        dataset.rewardAmount < filters.rewardRange[0] ||
        (filters.rewardRange[1] < 150 &&
          dataset.rewardAmount > filters.rewardRange[1])
      ) {
        return false;
      }

      // Status filter
      if (filters.status.length > 0) {
        if (!filters.status.includes(dataset.status)) return false;
      }

      return true;
    });
  }, [initialDatasets, filters]);

  // Sort datasets
  const sortedDatasets = useMemo(() => {
    const sorted = [...filteredDatasets];

    switch (sortBy) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime()
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.datePosted).getTime() - new Date(b.datePosted).getTime()
        );
        break;
      case "highest-reward":
        sorted.sort((a, b) => b.rewardAmount - a.rewardAmount);
        break;
      case "lowest-reward":
        sorted.sort((a, b) => a.rewardAmount - b.rewardAmount);
        break;
      case "most-popular":
        sorted.sort((a, b) => b.activeContributors - a.activeContributors);
        break;
      case "closing-soon":
        sorted.sort(
          (a, b) =>
            new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        );
        break;
    }

    return sorted;
  }, [filteredDatasets, sortBy]);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Browse Datasets</h1>
        <p className="text-lg text-muted-foreground">
          Discover and contribute to cutting-edge AI dataset projects
        </p>
      </div>

      {/* Search, Filters, and Sort Bar */}
      <div className="mb-8">
        <SearchSortBar
          search={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          resultCount={sortedDatasets.length}
          totalCount={initialDatasets.length}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
        />
      </div>

      {/* Main Content */}
      {sortedDatasets.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No datasets found</h3>
          <p className="text-muted-foreground mb-4">
            Try adjusting your filters or search terms
          </p>
          <Button onClick={clearFilters} variant="outline">
            Clear Filters
          </Button>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-6"
          }
        >
          {sortedDatasets.map((dataset) => (
            <DatasetCardImproved key={dataset.id} dataset={dataset} />
          ))}
        </div>
      )}
    </main>
  );
}
