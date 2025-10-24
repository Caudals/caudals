"use client";

import { useMemo, useState } from "react";

import { DatasetCardImproved } from "@/components/browse/dataset-card-improved";
import { SearchSortBar } from "@/components/browse/search-sort-bar";
import {
  Dataset,
  DatasetCategory,
  DatasetFilters,
  SortOption,
} from "@/types/dataset";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";
import { categoryLabels } from "@/lib/data/datasets";
import { cn } from "@/lib/utils";

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

  const clearFilters = () => {
    setFilters({
      search: "",
      categories: [],
      dataTypes: [],
      rewardRange: [0, 150],
      status: [],
    });
  };

  const toggleCategory = (category: DatasetCategory) => {
    setFilters((prev) => {
      const categories = prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category];

      return { ...prev, categories };
    });
  };

  const clearCategoryFilters = () => {
    setFilters((prev) => ({ ...prev, categories: [] }));
  };

  const popularCategories = useMemo(() => {
    const counts = new Map<DatasetCategory, number>();

    initialDatasets.forEach((dataset) => {
      counts.set(dataset.category, (counts.get(dataset.category) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([value, count]) => ({
        value,
        label: categoryLabels[value],
        count,
      }));
  }, [initialDatasets]);

  const heroMetrics = useMemo(() => {
    const active = initialDatasets.filter(
      (dataset) => dataset.status === "active"
    ).length;
    const closingSoon = initialDatasets.filter(
      (dataset) => dataset.status === "closing-soon"
    ).length;
    const featured = initialDatasets.filter(
      (dataset) => dataset.featured
    ).length;
    const contributors = initialDatasets.reduce(
      (total, dataset) => total + dataset.activeContributors,
      0
    );

    return [
      { label: "Active requests", value: active.toLocaleString() },
      { label: "Closing soon", value: closingSoon.toLocaleString() },
      { label: "Featured spotlights", value: featured.toLocaleString() },
      {
        label: "Contributors engaged",
        value: contributors.toLocaleString(),
      },
    ];
  }, [initialDatasets]);

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

  const { featuredDatasets, regularDatasets } = useMemo(() => {
    const featured = sortedDatasets
      .filter((dataset) => dataset.featured)
      .slice(0, 4);
    const featuredIds = new Set(featured.map((dataset) => dataset.id));
    const regular = sortedDatasets.filter(
      (dataset) => !featuredIds.has(dataset.id)
    );

    return { featuredDatasets: featured, regularDatasets: regular };
  }, [sortedDatasets]);

  const datasetsForGrid =
    regularDatasets.length > 0 ? regularDatasets : sortedDatasets;
  const hasResults = sortedDatasets.length > 0;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-10">
      <section className="rounded-2xl border border-border bg-card p-8 md:p-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-6">
            <Badge variant="secondary" className="w-fit">
              Dataset Marketplace
            </Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Discover Dataset Requests
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">
                Browse opportunities from leading AI teams. Filter by category,
                data type, and reward to find the perfect project.
              </p>
            </div>

            {popularCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {popularCategories.map(({ value, label, count }) => {
                  const isActive = filters.categories.includes(value);

                  return (
                    <Button
                      key={value}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="text-xs"
                      onClick={() => toggleCategory(value)}
                    >
                      {label}
                      <span className="ml-1.5 text-muted-foreground">
                        ({count})
                      </span>
                    </Button>
                  );
                })}

                {filters.categories.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={clearCategoryFilters}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid w-full max-w-lg grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-4 lg:max-w-xl lg:grid-cols-2">
            {heroMetrics.map((metric) => (
              <div key={metric.label} className="space-y-1 text-left">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-xl font-bold text-foreground">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-10">
        <SearchSortBar
          search={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          sortBy={sortBy}
          onSortChange={setSortBy}
          resultCount={sortedDatasets.length}
          totalCount={initialDatasets.length}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
        />
      </div>

      {hasResults ? (
        <>
          {featuredDatasets.length > 0 && (
            <section className="mt-12 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Featured Requests
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    High-priority opportunities from top organizations
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit text-xs">
                  {featuredDatasets.length} featured
                </Badge>
              </div>

              <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {featuredDatasets.map((dataset) => (
                  <DatasetCardImproved key={dataset.id} dataset={dataset} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  All Requests
                </h2>
                <p className="text-sm text-muted-foreground">
                  {sortedDatasets.length.toLocaleString()} opportunities
                  available
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {datasetsForGrid.map((dataset) => (
                <DatasetCardImproved key={dataset.id} dataset={dataset} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mt-16 flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed bg-muted/20 p-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Database className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              No matches found
            </h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Try adjusting your filters to see more results
            </p>
          </div>
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </section>
      )}
    </main>
  );
}
