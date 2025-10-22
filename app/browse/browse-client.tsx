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
      counts.set(
        dataset.category,
        (counts.get(dataset.category) || 0) + 1
      );
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
    const featured = initialDatasets.filter((dataset) => dataset.featured)
      .length;
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
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-8 md:p-12">
        <div className="pointer-events-none absolute -top-12 right-[-120px] h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-[-160px] h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-6">
            <Badge className="w-fit border border-primary/30 bg-primary/10 text-primary">
              Curated for contributors
            </Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Discover dataset requests ready for your expertise
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">
                Browse a modern feed of opportunities from leading AI teams.
                Filter by industry, data modality, and reward to find the
                perfect project to contribute to.
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
                      variant={isActive ? "default" : "secondary"}
                      className={cn(
                        "rounded-full border border-border/50 bg-background/80 text-xs font-medium shadow-sm transition",
                        isActive
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "hover:bg-background/80"
                      )}
                      onClick={() => toggleCategory(value)}
                    >
                      {label}
                      <span className="ml-1 text-muted-foreground/70">
                        {count}
                      </span>
                    </Button>
                  );
                })}

                {filters.categories.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full text-xs"
                    onClick={clearCategoryFilters}
                  >
                    Clear categories
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid w-full max-w-lg grid-cols-2 gap-4 rounded-3xl border border-border/40 bg-background/60 p-4 shadow-inner sm:grid-cols-4 lg:max-w-xl lg:grid-cols-2">
            {heroMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl bg-muted/40 p-4 text-left shadow-sm"
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-2 text-xl font-semibold text-foreground">
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
                  <h2 className="text-2xl font-semibold text-foreground">
                    Featured spotlights
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Momentum-rich requests gaining exceptional traction right
                    now.
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full px-3 py-1 text-xs"
                >
                  {featuredDatasets.length} featured
                </Badge>
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {featuredDatasets.map((dataset) => (
                  <DatasetCardImproved key={dataset.id} dataset={dataset} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  All dataset requests
                </h2>
                <p className="text-sm text-muted-foreground">
                  {sortedDatasets.length.toLocaleString()} curated opportunities
                  ready for contributors.
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {datasetsForGrid.map((dataset) => (
                <DatasetCardImproved key={dataset.id} dataset={dataset} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mt-16 flex flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-border/60 bg-muted/20 p-12 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-background shadow-inner">
            <Database className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              No dataset requests match your filters yet
            </h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Try broadening your filters or explore a different category to
              discover new opportunities for contribution.
            </p>
          </div>
          <Button variant="outline" onClick={clearFilters} className="rounded-full">
            Clear all filters
          </Button>
        </section>
      )}
    </main>
  );
}
