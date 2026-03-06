"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Edit3,
  MoreHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import { DatasetEditDialog } from "./dataset-edit-dialog";
import { BulkDatasetEditDialog } from "./bulk-dataset-edit-dialog";
import { AdminDatasetRequest } from "@/types/admin";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  adminDeleteDatasetRequest,
  adminBulkDeleteDatasetRequests,
  adminBulkUpdateDatasetApproval,
  adminBulkUpdateDatasetStatus,
  adminUpdateDatasetApproval,
} from "@/lib/actions/admin-actions";
import { ApprovalStatus } from "@/types/database";
import { DatasetStatus } from "@/types/dataset";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

interface AdminDatasetsTableProps {
  datasets: AdminDatasetRequest[];
}

export function AdminDatasetsTable({ datasets }: AdminDatasetsTableProps) {
  const [selectedDataset, setSelectedDataset] =
    useState<AdminDatasetRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusDatasetId, setStatusDatasetId] = useState<string | null>(null);
  const [deleteDatasetId, setDeleteDatasetId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkApprovalConfirm, setBulkApprovalConfirm] =
    useState<ApprovalStatus | null>(null);
  const [bulkStatusConfirm, setBulkStatusConfirm] =
    useState<DatasetStatus | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();
  const toast = useLocaleToast();
  const t = useTranslations();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isBulkStatusPending, startBulkStatusTransition] = useTransition();
  const [isBulkApprovalPending, startBulkApprovalTransition] = useTransition();
  const [isBulkDeletePending, startBulkDeleteTransition] = useTransition();
  const router = useRouter();

  const totals = useMemo(() => {
    const approved = datasets.filter(
      (dataset) => dataset.approval_status === "approved"
    ).length;
    const pending = datasets.filter(
      (dataset) => dataset.approval_status === "pending"
    ).length;
    const rejected = datasets.filter(
      (dataset) => dataset.approval_status === "rejected"
    ).length;

    return { approved, pending, rejected };
  }, [datasets]);

  const handleEdit = (dataset: AdminDatasetRequest) => {
    setSelectedDataset(dataset);
    setIsDialogOpen(true);
  };

  const handleApprovalChange = (
    dataset: AdminDatasetRequest,
    nextStatus: ApprovalStatus
  ) => {
    if (dataset.approval_status === nextStatus) return;
    setStatusDatasetId(dataset.id);
    startStatusTransition(async () => {
      const result = await adminUpdateDatasetApproval(dataset.id, nextStatus);
      if ("error" in result) {
        toast.error(result.error || "Failed to update approval status");
      } else {
        toast.success(
          t("Dataset marked as {{status}}.", { status: nextStatus }),
        );
      }
      router.refresh();
      setStatusDatasetId(null);
    });
  };

  const confirmDelete = (dataset: AdminDatasetRequest) => {
    setDeleteDatasetId(dataset.id);
  };

  const handleDelete = () => {
    if (!deleteDatasetId) return;
    const datasetId = deleteDatasetId;
    setPendingDeleteId(datasetId);
    startDeleteTransition(async () => {
      const result = await adminDeleteDatasetRequest(datasetId);
      if ("error" in result) {
        toast.error(result.error || "Failed to delete dataset");
      } else {
        toast.success("Dataset request deleted.");
      }
      router.refresh();
      setDeleteDatasetId(null);
      setPendingDeleteId(null);
    });
  };

  const selectionCount = selectedIds.length;
  const isAllSelected =
    selectionCount > 0 && selectionCount === datasets.length;
  const anyBulkPending =
    isBulkStatusPending || isBulkApprovalPending || isBulkDeletePending;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(datasets.map((dataset) => dataset.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelection = (datasetId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(datasetId) ? prev : [...prev, datasetId];
      }
      return prev.filter((id) => id !== datasetId);
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const runBulkStatusChange = (nextStatus: DatasetStatus) => {
    if (selectionCount === 0) return;
    startBulkStatusTransition(async () => {
      const result = await adminBulkUpdateDatasetStatus(
        selectedIds,
        nextStatus
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to update dataset status.");
      } else {
        const updated =
          "updated" in result && typeof result.updated === "number"
            ? result.updated
            : selectionCount;
        toast.success(
          `Updated status to ${statusLabels[nextStatus]} for ${updated} of ${selectionCount} dataset${selectionCount === 1 ? "" : "s"}.`
        );
        clearSelection();
      }
      router.refresh();
    });
  };

  const runBulkApprovalChange = (nextStatus: ApprovalStatus) => {
    if (selectionCount === 0) return;
    startBulkApprovalTransition(async () => {
      const result = await adminBulkUpdateDatasetApproval(
        selectedIds,
        nextStatus
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to update approval status.");
      } else {
        const updated =
          "updated" in result && typeof result.updated === "number"
            ? result.updated
            : selectionCount;
        toast.success(
          `Marked ${updated} of ${selectionCount} dataset${selectionCount === 1 ? "" : "s"} as ${nextStatus}.`
        );
        clearSelection();
      }
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    if (selectionCount === 0) return;
    startBulkDeleteTransition(async () => {
      const result = await adminBulkDeleteDatasetRequests(selectedIds);
      if ("error" in result) {
        toast.error(result.error || "Failed to delete datasets.");
      } else {
        const deleted =
          "deleted" in result && typeof result.deleted === "number"
            ? result.deleted
            : selectionCount;
        toast.success(
          `Deleted ${deleted} of ${selectionCount} dataset${selectionCount === 1 ? "" : "s"}.`
        );
        clearSelection();
      }
      setIsBulkDeleteDialogOpen(false);
      router.refresh();
    });
  };

  const handleBulkEditComplete = () => {
    router.refresh();
    clearSelection();
  };

  return (
    <>
      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl pb-4 py-0 gap-0">
        <CardContent className="space-y-4 p-0">
          {selectionCount > 0 && (
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 md:flex-row md:items-center md:justify-between m-4 rounded-xl">
              <div className="space-y-1">
                <p className="font-medium text-sm text-[var(--accent-foreground)]">
                  {selectionCount} dataset{selectionCount === 1 ? "" : "s"} selected
                </p>
                <p className="text-xs text-[var(--accent-foreground)]/80">
                  Apply bulk actions across the selected dataset requests.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shadow-none bg-white border-slate-200 h-8 text-xs"
                      disabled={anyBulkPending || selectionCount === 0}
                    >
                      {isBulkStatusPending ? (
                        "Updating..."
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                          Status
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(statusLabels) as DatasetStatus[]).map(
                      (status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => setBulkStatusConfirm(status)}
                        >
                          {statusLabels[status]}
                        </DropdownMenuItem>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shadow-none bg-white border-slate-200 h-8 text-xs"
                      disabled={anyBulkPending || selectionCount === 0}
                    >
                      {isBulkApprovalPending ? (
                        "Updating..."
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                          Approval
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["approved", "pending", "rejected"] as ApprovalStatus[]).map(
                      (status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => setBulkApprovalConfirm(status)}
                        >
                          <span className="capitalize">{status}</span>
                        </DropdownMenuItem>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  className="shadow-none bg-white border-slate-200 h-8 text-xs"
                  onClick={() => setIsBulkDialogOpen(true)}
                  disabled={anyBulkPending || selectionCount === 0}
                >
                  <Edit3 className="mr-2 h-3.5 w-3.5" />
                  Edit
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  className="shadow-none h-8 text-xs"
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  disabled={anyBulkPending || selectionCount === 0}
                >
                  {isBulkDeletePending ? (
                    "..."
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40px] pl-8 py-4">
                  <Checkbox
                    aria-label="Select all datasets"
                    checked={
                      isAllSelected
                        ? true
                        : selectionCount > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                    disabled={datasets.length === 0}
                    className="border-slate-300 data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[var(--accent)]"
                  />
                </TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Dataset</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Category</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Type</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Reward</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Approval</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-slate-500">
                    No datasets available.
                  </TableCell>
                </TableRow>
              )}
              {datasets.map((dataset) => (
                <TableRow
                  key={dataset.id}
                  className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white"
                  data-state={
                    selectedIds.includes(dataset.id) ? "selected" : undefined
                  }
                >
                  <TableCell className="pl-8 py-3">
                    <Checkbox
                      aria-label={`Select ${dataset.title}`}
                      checked={selectedIds.includes(dataset.id)}
                      onCheckedChange={(value) =>
                        toggleSelection(dataset.id, Boolean(value))
                      }
                      disabled={anyBulkPending}
                      className="border-slate-300 data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[var(--accent)]"
                    />
                  </TableCell>
                  <TableCell className="max-w-[300px] py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm text-slate-900 line-clamp-1" title={dataset.title}>
                        {dataset.title}
                      </span>
                      <span className="text-[11px] text-slate-500 flex gap-1.5 items-center mt-1">
                        <span className="truncate max-w-[120px]">
                          {dataset.profiles?.full_name || "Unknown"}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                        <span>
                          {new Date(dataset.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-normal shadow-none border border-slate-200">
                      {statusLabels[dataset.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="text-xs text-slate-600 font-medium">
                      {categoryLabels[dataset.category]}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200 text-slate-600">
                      {dataTypeLabels[dataset.data_type]}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-sm font-medium text-slate-900">
                    {dataset.currency} {dataset.reward_amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant={
                        dataset.approval_status === "approved"
                          ? "default"
                          : dataset.approval_status === "pending"
                            ? "outline"
                            : "destructive"
                      }
                      className={`shadow-none font-semibold text-[10px] uppercase tracking-wider ${
                        dataset.approval_status === "approved" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : dataset.approval_status === "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {dataset.approval_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right py-3 pr-8">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-900"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[180px] rounded-xl shadow-md border-slate-200 p-1.5">
                        <DropdownMenuItem onClick={() => handleEdit(dataset)} className="text-sm rounded-lg">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Dataset
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-100 my-1" />
                        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                          Set Approval
                        </div>
                        {(["approved", "pending", "rejected"] as ApprovalStatus[]).map(
                          (status) => (
                            <DropdownMenuItem
                              key={status}
                              onSelect={() => handleApprovalChange(dataset, status)}
                              className="text-sm flex items-center justify-between rounded-lg"
                              disabled={isStatusPending && statusDatasetId === dataset.id}
                            >
                              <span className="capitalize">{status}</span>
                              {dataset.approval_status === status && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              )}
                            </DropdownMenuItem>
                          )
                        )}
                        <DropdownMenuSeparator className="bg-slate-100 my-1" />
                        <DropdownMenuItem 
                          onClick={() => confirmDelete(dataset)}
                          className="text-red-600 focus:text-red-700 focus:bg-red-50 text-sm rounded-lg"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Request
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-slate-200 p-4 bg-white">
            <p className="text-xs font-medium text-slate-500">
              Showing {datasets.length} datasets
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled className="shadow-none rounded-lg h-8 text-xs border-slate-200">
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled className="shadow-none rounded-lg h-8 text-xs border-slate-200">
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DatasetEditDialog
        open={isDialogOpen}
        dataset={selectedDataset}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setSelectedDataset(null);
          }
        }}
      />

      <AlertDialog
        open={!!deleteDatasetId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDatasetId(null);
            setPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the dataset request and its associated submissions.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletePending && pendingDeleteId === deleteDatasetId}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletePending && pendingDeleteId === deleteDatasetId}
            >
              {isDeletePending && pendingDeleteId === deleteDatasetId
                ? "Deleting..."
                : "Delete request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkDatasetEditDialog
        open={isBulkDialogOpen}
        selectedCount={selectionCount}
        selectedIds={selectedIds}
        onOpenChange={(open) => setIsBulkDialogOpen(open)}
        onComplete={handleBulkEditComplete}
      />

      <AlertDialog
        open={bulkStatusConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBulkStatusConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply bulk status change?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update {selectionCount} selected dataset
              {selectionCount === 1 ? "" : "s"} to{" "}
              {bulkStatusConfirm ? statusLabels[bulkStatusConfirm] : "the selected status"}.
              Audit logs will capture rollback guidance for this operation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkStatusPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkStatusPending || !bulkStatusConfirm}
              onClick={() => {
                if (!bulkStatusConfirm) return;
                runBulkStatusChange(bulkStatusConfirm);
                setBulkStatusConfirm(null);
              }}
            >
              {isBulkStatusPending ? "Updating..." : "Apply change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkApprovalConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBulkApprovalConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply bulk approval update?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set approval to{" "}
              <span className="capitalize">{bulkApprovalConfirm || "selected status"}</span>{" "}
              for {selectionCount} selected dataset
              {selectionCount === 1 ? "" : "s"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkApprovalPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkApprovalPending || !bulkApprovalConfirm}
              onClick={() => {
                if (!bulkApprovalConfirm) return;
                runBulkApprovalChange(bulkApprovalConfirm);
                setBulkApprovalConfirm(null);
              }}
            >
              {isBulkApprovalPending ? "Updating..." : "Apply change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsBulkDeleteDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove selected datasets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectionCount} dataset
              {selectionCount === 1 ? "" : "s"} and any related submissions.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isBulkDeletePending}
              onClick={() => setIsBulkDeleteDialogOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none"
              onClick={handleBulkDelete}
              disabled={isBulkDeletePending}
            >
              {isBulkDeletePending ? "Deleting..." : "Delete datasets"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
