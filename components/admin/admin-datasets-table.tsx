"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import {
  adminDeleteDatasetRequest,
  adminUpdateDatasetApproval,
} from "@/lib/actions/admin-actions";
import { ApprovalStatus } from "@/types/database";

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
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
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
        toast.success(`Dataset marked as ${nextStatus}.`);
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
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow key={dataset.id}>
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
    </>
  );
}
