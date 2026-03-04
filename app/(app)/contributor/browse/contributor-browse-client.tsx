"use client";

import { useMemo, useState } from "react";

import { DatasetCardImproved } from "@/components/browse/dataset-card-improved";
import { SearchSortBar } from "@/components/browse/search-sort-bar";
import { Dataset, DatasetFilters, SortOption } from "@/types/dataset";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

interface BrowseClientProps {
  initialDatasets: Dataset[];
}

export function ContributorBrowseClient({ initialDatasets }: BrowseClientProps) {
  const t = useTranslations();
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
    <div className="space-y-6">
      <div className="mb-6">
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
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {t("Featured requests")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("High-priority opportunities from top organizations")}
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit text-xs">
                  {t("{{count}} featured", {
                    count: featuredDatasets.length.toLocaleString(),
                  })}
                </Badge>
              </div>

              <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {featuredDatasets.map((dataset) => (
                  <DatasetCardImproved key={dataset.id} dataset={dataset} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {t("All requests")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("{{count}} opportunities available", {
                    count: sortedDatasets.length.toLocaleString(),
                  })}
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {datasetsForGrid.map((dataset) => (
                <DatasetCardImproved key={dataset.id} dataset={dataset} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mt-8 flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed bg-white shadow-sm p-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
            <Database className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {t("No matches found")}
            </h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {t("Try adjusting your filters to see more results")}
            </p>
          </div>
          <Button variant="outline" onClick={clearFilters}>
            {t("Clear filters")}
          </Button>
        </section>
      )}
    </div>
  );
}
