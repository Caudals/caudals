"use client";

import { useState } from "react";
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
import { CheckCircle, XCircle, Eye, Pencil } from "lucide-react";
import { ApprovalDialog } from "./approval-dialog";
import { categoryLabels } from "@/lib/data/datasets";
import { AdminDatasetRequest } from "@/types/admin";
import { DatasetEditDialog } from "./dataset-edit-dialog";
import { useTranslations } from "@/lib/i18n/use-translations";

interface PendingRequestsTableProps {
  requests: AdminDatasetRequest[];
}

export function PendingRequestsTable({ requests }: PendingRequestsTableProps) {
  const [selectedRequest, setSelectedRequest] =
    useState<AdminDatasetRequest | null>(null);
  const [dialogType, setDialogType] = useState<"approve" | "reject" | null>(
    null
  );
  const [editingRequest, setEditingRequest] =
    useState<AdminDatasetRequest | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const t = useTranslations();

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("No Pending Requests")}</CardTitle>
          <CardDescription>
            {t("All dataset requests have been reviewed")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Dataset Requests Awaiting Approval")}</CardTitle>
          <CardDescription>
            {requests.length} request{requests.length !== 1 ? "s" : ""}{" "}
            {t("pending review")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title")}</TableHead>
                <TableHead>{t("Requester")}</TableHead>
                <TableHead>{t("Category")}</TableHead>
                <TableHead>{t("Samples Needed")}</TableHead>
                <TableHead>{t("Reward")}</TableHead>
                <TableHead>{t("Submitted")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium max-w-md">
                    <div className="line-clamp-2">{request.title}</div>
                  </TableCell>
                  <TableCell>
                    {request.profiles?.full_name || t("Unknown")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {categoryLabels[request.category] || request.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.samples_needed.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    ${request.reward_amount} {request.currency}
                  </TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType(null);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType("approve");
                        }}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingRequest(request);
                          setIsEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType("reject");
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedRequest && (
        <ApprovalDialog
          open={!!selectedRequest}
          onClose={() => {
            setSelectedRequest(null);
            setDialogType(null);
          }}
          item={selectedRequest}
          type={dialogType || "view"}
          itemType="request"
        />
      )}

      <DatasetEditDialog
        open={isEditOpen}
        dataset={editingRequest}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingRequest(null);
          }
        }}
      />
    </>
  );
}
