"use client";

import { useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dataset,
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import { PwaDatasetCard } from "./pwa-dataset-card";
import { cn } from "@/lib/utils";

type SortOption = "recent" | "reward" | "popular";

interface PwaBrowseClientProps {
  initialDatasets: Dataset[];
}

export function PwaBrowseClient({ initialDatasets }: PwaBrowseClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<DatasetCategory | "all">("all");
  const [dataType, setDataType] = useState<DataType | "all">("all");
  const [status, setStatus] = useState<DatasetStatus | "all">("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(initialDatasets.map((dataset) => dataset.category))
    );
    return ["all", ...categories];
  }, [initialDatasets]);

  const dataTypeOptions = useMemo(() => {
    const types = Array.from(
      new Set(initialDatasets.map((dataset) => dataset.dataType))
    );
    return ["all", ...types];
  }, [initialDatasets]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(initialDatasets.map((dataset) => dataset.status))
    );
    return ["all", ...statuses];
  }, [initialDatasets]);

  const filteredDatasets = useMemo(() => {
    const filtered = initialDatasets.filter((dataset) => {
      const matchesSearch =
        dataset.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.organization.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesCategory =
        category === "all" || dataset.category === category;
      const matchesDataType =
        dataType === "all" || dataset.dataType === dataType;
      const matchesStatus = status === "all" || dataset.status === status;
      const matchesFeatured = featuredOnly ? dataset.featured : true;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesDataType &&
        matchesStatus &&
        matchesFeatured
      );
    });

    const sorted = filtered.sort((a, b) => {
      if (sortBy === "reward") {
        return b.rewardAmount - a.rewardAmount;
      }
      if (sortBy === "popular") {
        return b.activeContributors - a.activeContributors;
      }
      return (
        new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime()
      );
    });

    return sorted;
  }, [
    initialDatasets,
    searchTerm,
    category,
    dataType,
    status,
    featuredOnly,
    sortBy,
  ]);

  const resetFilters = () => {
    setSearchTerm("");
    setCategory("all");
    setDataType("all");
    setStatus("all");
    setFeaturedOnly(false);
    setSortBy("recent");
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_30px_rgba(8,15,40,0.45)]">
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/20 px-4 py-3">
          <Search className="h-4 w-4 text-white/50" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search briefs or organizations"
            className="border-0 bg-transparent text-sm text-white placeholder:text-white/40 focus-visible:ring-0"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {categoryOptions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setCategory(value as DatasetCategory | "all")
              }
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition",
                category === value
                  ? "border-white bg-white text-slate-900"
                  : "border-white/20 bg-white/5 text-white/70"
              )}
            >
              {value === "all" ? "All topics" : categoryLabels[value]}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">
            Data type
          </p>
          <div className="flex flex-wrap gap-2">
            {dataTypeOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDataType(value as DataType | "all")}
                className={cn(
                  "rounded-2xl border px-3 py-1.5 text-sm transition",
                  dataType === value
                    ? "border-emerald-300/80 bg-emerald-400/20 text-white"
                    : "border-white/15 bg-white/5 text-white/70"
                )}
              >
                {value === "all" ? "Any" : dataTypeLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setStatus(value as DatasetStatus | "all")
                }
                className={cn(
                  "rounded-2xl border px-3 py-1.5 text-sm transition",
                  status === value
                    ? "border-sky-300/80 bg-sky-400/20 text-white"
                    : "border-white/15 bg-white/5 text-white/70"
                )}
              >
                {value === "all" ? "Any" : statusLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-2xl border border-white/15 bg-white/5 text-white",
              featuredOnly && "border-amber-300/70 bg-amber-400/30 text-white"
            )}
            onClick={() => setFeaturedOnly((prev) => !prev)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Featured only
          </Button>

          <div className="flex flex-1 justify-end gap-2">
            {(["recent", "reward", "popular"] as SortOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSortBy(option)}
                className={cn(
                  "flex-1 rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition",
                  sortBy === option
                    ? "border-white bg-white text-slate-900"
                    : "border-white/15 bg-transparent text-white/60"
                )}
              >
                {option === "recent"
                  ? "Newest"
                  : option === "reward"
                    ? "Top reward"
                    : "Most active"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-white/60">
          <span>{filteredDatasets.length} briefs</span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-white/80 underline-offset-4 hover:underline"
          >
            Reset filters
          </button>
        </div>
      </div>

      {filteredDatasets.length > 0 ? (
        <div className="space-y-4">
          {filteredDatasets.map((dataset) => (
            <PwaDatasetCard key={dataset.id} dataset={dataset} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white/70">
          <p className="text-lg font-semibold text-white">
            No briefs match those filters
          </p>
          <p className="mt-2 text-sm">
            Try widening your category or data type selections.
          </p>
          <Button
            variant="secondary"
            className="mt-4 rounded-2xl"
            onClick={resetFilters}
          >
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}
