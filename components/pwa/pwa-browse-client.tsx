"use client";

import { useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useTranslations } from "@/lib/i18n/use-translations";

type SortOption = "recent" | "reward" | "popular";

interface PwaBrowseClientProps {
  initialDatasets: Dataset[];
}

export function PwaBrowseClient({ initialDatasets }: PwaBrowseClientProps) {
  const t = useTranslations();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<DatasetCategory | "all">("all");
  const [dataType, setDataType] = useState<DataType | "all">("all");
  const [status, setStatus] = useState<DatasetStatus | "all">("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

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
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_6px_20px_rgba(4,6,20,0.55)]">
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/15 px-4 py-3">
          <Search className="h-4 w-4 text-white/50" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("Search briefs or organizations")}
            className="border-0 bg-transparent text-sm text-white placeholder:text-white/50 focus-visible:ring-0"
          />
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="secondary"
                className="flex-1 rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/20"
              >
                <Filter className="mr-2 h-4 w-4" />
                {t("Refine")}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[80vh] rounded-t-[30px] border-white/10 bg-slate-950 text-white"
            >
              <SheetHeader>
                <SheetTitle>{t("Filters")}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 overflow-y-auto pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("Category")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
                        {value === "all" ? t("All topics") : t(categoryLabels[value])}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("Data type")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
                        {value === "all" ? t("Any") : t(dataTypeLabels[value])}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("Status")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
                        {value === "all" ? t("Any") : t(statusLabels[value])}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      {t("Spotlight")}
                    </p>
                    <p className="text-sm text-white">{t("Featured only")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-xl border-white/30 bg-transparent text-white",
                      featuredOnly && "border-amber-300/70 bg-amber-400/20 text-white"
                    )}
                    onClick={() => setFeaturedOnly((prev) => !prev)}
                  >
                    {featuredOnly ? t("Disable") : t("Enable")}
                  </Button>
                </div>
              </div>
              <SheetFooter className="mt-4 flex-col gap-3">
                <Button
                  variant="ghost"
                  className="w-full rounded-2xl border border-white/15 bg-transparent text-white"
                  onClick={resetFilters}
                >
                  {t("Reset filters")}
                </Button>
                <SheetClose asChild>
                  <Button className="w-full rounded-2xl bg-white text-slate-900">
                    {t("Show results")}
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="flex-1 rounded-2xl border border-white/15 bg-black/20 text-white">
              <SelectValue placeholder={t("Sort")} />
            </SelectTrigger>
            <SelectContent className="border border-white/10 bg-slate-900 text-white">
              <SelectItem value="recent">{t("Newest")}</SelectItem>
              <SelectItem value="reward">{t("Top reward")}</SelectItem>
              <SelectItem value="popular">{t("Most active")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="mt-3 text-xs uppercase tracking-[0.4em] text-white/40">
          {filteredDatasets.length} {t("briefs")}
        </p>
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
            {t("No briefs match those filters")}
          </p>
          <p className="mt-2 text-sm">
            {t("Try widening your category or data type selections.")}
          </p>
          <Button
            variant="secondary"
            className="mt-4 rounded-2xl"
            onClick={resetFilters}
          >
            {t("Clear filters")}
          </Button>
        </div>
      )}
    </section>
  );
}
