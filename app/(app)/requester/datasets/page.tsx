import Link from "next/link";
import { DatasetFilters } from "@/components/requester/datasets/dataset-filters";
import { DatasetTable } from "@/components/requester/datasets/dataset-table";
import { getRequesterDatasets, DatasetListFilters } from "@/lib/actions/requester-actions";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { DatasetStatus } from "@/types/dataset";
import { getServerTranslator } from "@/lib/i18n/server";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function RequesterDatasetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const statusParam =
    typeof params.status === "string" && params.status !== "all"
      ? (params.status as DatasetStatus)
      : undefined;
  const quickFilterParam =
    typeof params.filter === "string" &&
    ["needs_funding", "pending_review", "download_ready", "drafts"].includes(params.filter)
      ? (params.filter as DatasetListFilters["quickFilter"])
      : undefined;

  const filters: DatasetListFilters = {
    search: typeof params.search === "string" ? params.search : undefined,
    quickFilter: quickFilterParam,
    status: statusParam ? [statusParam] : undefined,
    page,
    perPage: 10,
  };

  const result = await getRequesterDatasets(filters);
  const t = await getServerTranslator();

  if ("error" in result) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {result.error}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));
  const search = new URLSearchParams();
  if (typeof params.search === "string") search.set("search", params.search);
  if (typeof params.status === "string" && params.status !== "all") search.set("status", params.status);
  if (typeof params.filter === "string") search.set("filter", params.filter);

  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(search.toString());
    if (nextPage > 1) {
      next.set("page", String(nextPage));
    } else {
      next.delete("page");
    }
    return `?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        title="Manage dataset briefs"
        description="Track funding, progress, and review readiness across all active and draft requests."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/requester/files">{t("Files & downloads")}</Link>
            </Button>
            <Button asChild>
              <Link href="/requester/datasets/new">{t("New dataset")}</Link>
            </Button>
          </>
        }
      />

      <DatasetFilters />

      <DatasetTable datasets={result.items} />

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {t("Showing {{count}} of {{total}} datasets", {
            count: result.items.length,
            total: result.total,
          })}
        </span>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={pageHref(Math.max(1, page - 1))}
                aria-disabled={page === 1}
                className={page === 1 ? "pointer-events-none opacity-40" : undefined}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href={pageHref(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                className={page >= totalPages ? "pointer-events-none opacity-40" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
