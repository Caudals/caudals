"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
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
  draft: "border-dashed border-border text-slate-500",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
  paused: "bg-amber-50 text-amber-700 border-amber-200/50",
  completed: "bg-blue-50 text-blue-700 border-blue-200/50",
  archived: "bg-muted text-slate-500 border-transparent",
};

const approvalVariant: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
  pending: "bg-amber-50 text-amber-700 border-amber-200/50",
  rejected: "bg-red-50 text-red-700 border-red-200/50",
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
    <div className="rounded-2xl border border-slate-200 shadow-none bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4">
        <div className="flex items-center gap-3 text-sm text-slate-700 font-medium">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(value) => toggleAll(Boolean(value))}
            className="data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[var(--accent)]"
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
              className="shadow-none rounded-lg h-8 px-3 border-slate-200 bg-white"
            >
              <PauseCircle className="mr-2 h-4 w-4" /> {t("Pause")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => bulkUpdateStatus("active")}
              className="shadow-none rounded-lg h-8 px-3 border-slate-200 bg-white"
            >
              <PlayCircle className="mr-2 h-4 w-4" /> {t("Resume")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => bulkUpdateStatus("archived")}
              className="shadow-none rounded-lg h-8 px-3 border-slate-200 bg-white"
            >
              {t("Archive")}
            </Button>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            {t("Track status, funding, and QA for every dataset.")}
          </div>
        )}
      </div>
      <Table>
        <TableHeader className="bg-slate-50 border-b border-slate-200">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 pl-8 py-4"></TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Dataset")}</TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Status")}</TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Samples")}</TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Budget")}</TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Pending")}</TableHead>
            <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-16 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center">
                  <ShieldCheck className="h-10 w-10 text-slate-300 mb-3" />
                  <p>{t("Nothing to show yet.")}</p>
                </div>
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
                <TableRow key={dataset.id} className="align-top hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="pl-8 py-4">
                    <Checkbox
                      checked={selected.includes(dataset.id)}
                      onCheckedChange={(value) => toggleRow(dataset.id, Boolean(value))}
                      className="data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[var(--accent)]"
                    />
                  </TableCell>
                  <TableCell className="max-w-xs py-4">
                    <div className="space-y-1.5">
                      <Link
                        href={`/requester/datasets/${dataset.id}`}
                        className="font-semibold text-slate-900 hover:text-[var(--accent)] transition-colors line-clamp-2"
                      >
                        {dataset.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "shadow-none font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 border",
                            statusVariant[dataset.status] ?? "bg-slate-100 text-slate-600 border-slate-200"
                          )}
                        >
                          {formatStatus(dataset.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shadow-none font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 border",
                            approvalVariant[dataset.approval_status] ?? ""
                          )}
                        >
                          {formatApprovalStatus(dataset.approval_status)}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="text-sm font-medium text-slate-900">
                      ${Number(dataset.reward_amount).toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-0.5">
                      {dataset.data_type}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[160px] py-4">
                    <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                      <span className="text-slate-900">
                        {dataset.samples_collected}/{dataset.samples_needed}
                      </span>
                      <span className="text-slate-500">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="text-sm font-bold text-slate-900">
                      ${budget.funded.toLocaleString()}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t("of {{amount}} budget", { amount: `$${budget.total.toLocaleString()}` })}
                    </p>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant={pending > 0 ? "destructive" : "secondary"} className={`shadow-none font-medium ${pending > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {t("{{count}} pending", { count: pending })}
                    </Badge>
                    {dataset.latestExport?.status === "ready" && (
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600 mt-1">{t("Export ready")}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-4 pr-8">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-md border-slate-200 p-1.5">
                        <DropdownMenuItem asChild className="rounded-lg text-sm">
                          <Link href={`/requester/datasets/${dataset.id}`}>
                            {t("View workspace")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(dataset.id)} className="rounded-lg text-sm">
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
                          className="rounded-lg text-sm"
                        >
                          {dataset.status === "paused" ? t("Resume") : t("Pause")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchive(dataset.id)} className="rounded-lg text-sm text-red-600 focus:text-red-700 focus:bg-red-50">
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