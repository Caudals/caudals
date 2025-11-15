"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Edit3,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

  const handleBulkStatusChange = (nextStatus: DatasetStatus) => {
    if (selectionCount === 0) return;
    startBulkStatusTransition(async () => {
      const result = await adminBulkUpdateDatasetStatus(
        selectedIds,
        nextStatus
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to update dataset status.");
      } else {
        toast.success(
          `Updated status to ${statusLabels[nextStatus]} for ${selectionCount} dataset${selectionCount === 1 ? "" : "s"}.`
        );
        clearSelection();
      }
      router.refresh();
    });
  };

  const handleBulkApprovalChange = (nextStatus: ApprovalStatus) => {
    if (selectionCount === 0) return;
    startBulkApprovalTransition(async () => {
      const result = await adminBulkUpdateDatasetApproval(
        selectedIds,
        nextStatus
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to update approval status.");
      } else {
        toast.success(
          `Marked ${selectionCount} dataset${selectionCount === 1 ? "" : "s"} as ${nextStatus}.`
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
        toast.success(
          `Deleted ${selectionCount} dataset${selectionCount === 1 ? "" : "s"}.`
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
      <Card>
        <CardHeader>
          <CardTitle>Manage Dataset Requests</CardTitle>
          <CardDescription>
            {datasets.length} dataset{datasets.length !== 1 ? "s" : ""} •{" "}
            <span className="text-muted-foreground">
              {totals.approved} approved · {totals.pending} pending ·{" "}
              {totals.rejected} rejected
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectionCount > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="font-medium">
                  {selectionCount} dataset{selectionCount === 1 ? "" : "s"} selected
                </p>
                <p className="text-sm text-muted-foreground">
                  Apply bulk actions across the selected dataset requests.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={anyBulkPending || selectionCount === 0}
                    >
                      {isBulkStatusPending ? (
                        "Updating..."
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Change status
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(statusLabels) as DatasetStatus[]).map(
                      (status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => handleBulkStatusChange(status)}
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
                      variant="secondary"
                      size="sm"
                      disabled={anyBulkPending || selectionCount === 0}
                    >
                      {isBulkApprovalPending ? (
                        "Updating..."
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Update approval
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["approved", "pending", "rejected"] as ApprovalStatus[]).map(
                      (status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => handleBulkApprovalChange(status)}
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
                  onClick={() => setIsBulkDialogOpen(true)}
                  disabled={anyBulkPending || selectionCount === 0}
                >
                  <Edit3 className="mr-2 h-4 w-4" />
                  Bulk edit
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  disabled={anyBulkPending || selectionCount === 0}
                >
                  {isBulkDeletePending ? (
                    "Deleting..."
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
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
                  />
                </TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow
                  key={dataset.id}
                  data-state={
                    selectedIds.includes(dataset.id) ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${dataset.title}`}
                      checked={selectedIds.includes(dataset.id)}
                      onCheckedChange={(value) =>
                        toggleSelection(dataset.id, Boolean(value))
                      }
                      disabled={anyBulkPending}
                    />
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground line-clamp-2">
                        {dataset.title}
                      </p>
                      <p className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>
                          {dataset.profiles?.full_name || "Unknown requester"}
                        </span>
                        <span>•</span>
                        <span>
                          Created{" "}
                          {new Date(dataset.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </span>
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {statusLabels[dataset.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {categoryLabels[dataset.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {dataTypeLabels[dataset.data_type]}
                  </TableCell>
                  <TableCell>
                    {dataset.currency} {dataset.reward_amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {new Date(dataset.deadline).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        dataset.approval_status === "approved"
                          ? "default"
                          : dataset.approval_status === "pending"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {dataset.approval_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isStatusPending && statusDatasetId === dataset.id}
                          >
                            {isStatusPending && statusDatasetId === dataset.id ? (
                              "Updating..."
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Set status
                              </>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(["approved", "pending", "rejected"] as ApprovalStatus[]).map(
                            (status) => (
                              <DropdownMenuItem
                                key={status}
                                onSelect={() => handleApprovalChange(dataset, status)}
                                className="flex items-center justify-between"
                              >
                                <span className="capitalize">{status}</span>
                                {dataset.approval_status === status && (
                                  <span className="text-xs text-muted-foreground">
                                    current
                                  </span>
                                )}
                              </DropdownMenuItem>
                            )
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(dataset)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => confirmDelete(dataset)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
