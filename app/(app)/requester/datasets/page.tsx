import Link from "next/link";
import { DatasetFilters } from "@/components/requester/datasets/dataset-filters";
import { DatasetTable } from "@/components/requester/datasets/dataset-table";
import { getRequesterDatasets, DatasetListFilters } from "@/lib/actions/requester-actions";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import type { DatasetStatus } from "@/types/dataset";
import { getServerTranslator } from "@/lib/i18n/server";

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
    typeof params.filter === "string" && ["needs_funding", "pending_review", "download_ready", "drafts"].includes(params.filter)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t("Datasets")}</p>
          <h1 className="text-2xl font-semibold">{t("Manage briefs")}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/requester/files">{t("Files & downloads")}</Link>
          </Button>
          <Button asChild>
            <Link href="/requester/datasets/new">{t("New dataset")}</Link>
          </Button>
        </div>
      </div>

      <DatasetFilters />

      <DatasetTable datasets={result.items} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                href={`?page=${Math.max(1, page - 1)}`}
                aria-disabled={page === 1}
                className={page === 1 ? "pointer-events-none opacity-40" : undefined}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href={`?page=${Math.min(totalPages, page + 1)}`}
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
