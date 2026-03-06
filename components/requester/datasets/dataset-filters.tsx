"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/lib/i18n/use-translations";

const QUICK_FILTERS = [
  { id: "needs_funding", label: "Needs funding" },
  { id: "pending_review", label: "Pending review" },
  { id: "download_ready", label: "Download ready" },
  { id: "drafts", label: "Drafts" },
];

export function DatasetFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "all";
  const quickFilter = searchParams.get("filter") ?? "";

  const updateParams = (params: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (!value) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    router.push(`${pathname}?${newParams.toString()}`);
  };

  return (
    <div className="space-y-4 rounded-t-2xl border-b-0 border border-slate-200 bg-slate-50/50 p-4">
      <div className="grid gap-3 md:grid-cols-[1.5fr,1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            defaultValue={currentSearch}
            placeholder={t("Search datasets")}
            className="pl-9 h-10 shadow-none rounded-xl bg-background border-border"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const target = event.target as HTMLInputElement;
                updateParams({ search: target.value });
              }
            }}
          />
        </div>
        <Select
          defaultValue={currentStatus}
          onValueChange={(value) => updateParams({ status: value === "all" ? null : value })}
        >
          <SelectTrigger className="h-10 shadow-none rounded-xl bg-background border-border">
            <SelectValue placeholder={t("Status")} />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border">
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            <SelectItem value="active">{t("Active")}</SelectItem>
            <SelectItem value="paused">{t("Paused")}</SelectItem>
            <SelectItem value="draft">{t("Draft")}</SelectItem>
            <SelectItem value="completed">{t("Completed")}</SelectItem>
            <SelectItem value="archived">{t("Archived")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter) => (
          <Button
            key={filter.id}
            variant={quickFilter === filter.id ? "secondary" : "outline"}
            size="sm"
            className={`shadow-none rounded-lg text-xs h-8 ${quickFilter === filter.id ? 'bg-[var(--accent)]/10 text-[var(--accent-foreground)] border-transparent' : 'bg-background border-border/60 hover:bg-slate-50/500'}`}
            onClick={() =>
              updateParams({
                filter: quickFilter === filter.id ? null : filter.id,
              })
            }
          >
            {t(filter.label)}
          </Button>
        ))}
      </div>
    </div>
  );
}
