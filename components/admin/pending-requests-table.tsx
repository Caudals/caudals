"use client";

import { useState } from "react";
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
      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
        <CardContent className="py-16 text-center">
          <div className="flex flex-col items-center justify-center">
            <CheckCircle className="h-10 w-10 text-emerald-500/50 mb-4" />
            <p className="text-foreground font-medium">{t("All caught up!")}</p>
            <p className="text-sm text-slate-500 mt-1">{t("No Pending Requests. All dataset requests have been reviewed.")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">{t("Title")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Requester")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Category")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Samples Needed")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Reward")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Submitted")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="font-medium max-w-[280px] pl-8 py-4">
                    <div className="line-clamp-2 text-sm text-slate-900">{request.title}</div>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-sm text-slate-700">{request.profiles?.full_name || t("Unknown")}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="secondary" className="shadow-none bg-slate-100 border-slate-200 text-slate-700 font-normal">
                      {categoryLabels[request.category] || request.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-sm font-medium text-slate-900">{request.samples_needed.toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-sm font-medium text-emerald-700">${request.reward_amount}</span> <span className="text-xs text-slate-500">{request.currency}</span>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-500">
                    {new Date(request.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </TableCell>
                  <TableCell className="py-4 pr-8">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        title={t("View Details")}
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType(null);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        title={t("Edit")}
                        onClick={() => {
                          setEditingRequest(request);
                          setIsEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-slate-200 mx-1"></div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Reject")}
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType("reject");
                        }}
                        className="h-8 w-8 text-slate-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Approve")}
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType("approve");
                        }}
                        className="h-8 w-8 text-emerald-600 bg-emerald-50 hover:text-emerald-700 hover:bg-emerald-100 shadow-none border border-emerald-200/50"
                      >
                        <CheckCircle className="h-4 w-4" />
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
