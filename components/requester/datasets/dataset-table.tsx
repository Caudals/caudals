"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PauseCircle, PlayCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { updateDatasetStatus, duplicateDataset, DatasetListItem } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/use-translations";

const statusVariant: Record<string, string> = {
  draft: "border-dashed border-muted-foreground/30 text-muted-foreground",
  active: "bg-emerald-500/10 text-emerald-600",
  paused: "bg-amber-500/10 text-amber-700",
  completed: "bg-blue-500/10 text-blue-700",
  archived: "bg-muted text-muted-foreground",
};

const approvalVariant: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-700",
  rejected: "bg-rose-500/10 text-rose-700",
};

export function DatasetTable({ datasets }: { datasets: DatasetListItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const formatStatus = (status?: string | null) => {
    switch (status) {
      case "draft":
        return t("Draft");
      case "active":
        return t("Active");
      case "paused":
        return t("Paused");
      case "completed":
        return t("Completed");
      case "archived":
        return t("Archived");
      case "closing-soon":
        return t("Closing soon");
      default:
        return status ?? "";
    }
  };

  const formatApprovalStatus = (status?: string | null) => {
    switch (status) {
      case "approved":
        return t("Approved");
      case "pending":
        return t("Pending");
      case "rejected":
        return t("Rejected");
      case "needs_changes":
        return t("Needs changes");
      default:
        return status ?? "";
    }
  };

  const allSelected = selected.length === datasets.length && datasets.length > 0;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? datasets.map((dataset) => dataset.id) : []);
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((selectedId) => selectedId !== id)
    );
  };

  const bulkUpdateStatus = (status: "paused" | "active" | "archived") => {
    if (selected.length === 0) return;
    startTransition(async () => {
      try {
        await Promise.all(selected.map((id) => updateDatasetStatus(id, status)));
        toast.success(t("Status updated for {{count}} datasets", { count: selected.length }));
        setSelected([]);
        router.refresh();
      } catch (error) {
        console.error(error);
        toast.error(t("Unable to update status"));
      }
    });
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      const result = await duplicateDataset(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(t("Dataset duplicated"));
        router.refresh();
      }
    });
  };

  const handleArchive = (id: string) => {
    startTransition(async () => {
      const result = await updateDatasetStatus(id, "archived");
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(t("Dataset archived"));
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(value) => toggleAll(Boolean(value))}
          />
          <span>
            {selected.length > 0
              ? t("{{count}} selected", { count: selected.length })
              : t("{{count}} datasets", { count: datasets.length })}
          </span>
        </div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => bulkUpdateStatus("paused")}
            >
              <PauseCircle className="mr-2 h-4 w-4" /> {t("Pause")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => bulkUpdateStatus("active")}
            >
              <PlayCircle className="mr-2 h-4 w-4" /> {t("Resume")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => bulkUpdateStatus("archived")}
            >
              {t("Archive")}
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {t("Track status, funding, and QA for every dataset.")}
          </div>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent w-12"></TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">{t("Dataset")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">{t("Status")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">{t("Samples")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">{t("Budget")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">{t("Pending")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-right">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                {t("Nothing to show yet.")}
              </TableCell>
            </TableRow>
          ) : (
            datasets.map((dataset) => {
              const progress = dataset.samples_needed
                ? Math.min(
                    100,
                    Math.round((dataset.samples_collected / dataset.samples_needed) * 100)
                  )
                : 0;
              const budget = {
                total: Number(dataset.total_budget ?? 0),
                funded: Number(dataset.paid_amount ?? 0),
              };
              const pending = dataset.pendingSubmissions;

              return (
                <TableRow key={dataset.id} className="align-top">
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(dataset.id)}
                      onCheckedChange={(value) => toggleRow(dataset.id, Boolean(value))}
                    />
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="space-y-1">
                      <Link
                        href={`/requester/datasets/${dataset.id}`}
                        className="font-medium hover:underline"
                      >
                        {dataset.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize",
                            statusVariant[dataset.status] ?? "bg-muted"
                          )}
                        >
                          {formatStatus(dataset.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            approvalVariant[dataset.approval_status] ?? ""
                          )}
                        >
                          {formatApprovalStatus(dataset.approval_status)}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {t("Reward")} ${Number(dataset.reward_amount).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">{dataset.data_type}</div>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {dataset.samples_collected}/{dataset.samples_needed}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="mt-1" />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      ${budget.funded.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("of {{amount}} budget", { amount: `$${budget.total.toLocaleString()}` })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pending > 0 ? "destructive" : "outline"}>
                      {t("{{count}} pending", { count: pending })}
                    </Badge>
                    {dataset.latestExport?.status === "ready" && (
                      <p className="text-xs text-muted-foreground">{t("Export ready")}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link href={`/requester/datasets/${dataset.id}`}>
                            {t("View workspace")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(dataset.id)}>
                          {t("Duplicate as draft")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            startTransition(async () => {
                              const newStatus = dataset.status === "paused" ? "active" : "paused";
                              await updateDatasetStatus(dataset.id, newStatus);
                              toast.success(
                                t("Marked {{status}}", {
                                  status: formatStatus(newStatus),
                                }),
                              );
                              router.refresh();
                            })
                          }
                        >
                          {dataset.status === "paused" ? t("Resume") : t("Pause")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchive(dataset.id)}>
                          {t("Archive dataset")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
