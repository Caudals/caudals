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
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { ApprovalDialog } from "./approval-dialog";
import { categoryLabels } from "@/lib/data/datasets";

interface DatasetRequest {
  id: string;
  title: string;
  category: string;
  samples_needed: number;
  reward_amount: number;
  currency: string;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}

interface PendingRequestsTableProps {
  requests: DatasetRequest[];
}

export function PendingRequestsTable({ requests }: PendingRequestsTableProps) {
  const [selectedRequest, setSelectedRequest] = useState<DatasetRequest | null>(null);
  const [dialogType, setDialogType] = useState<"approve" | "reject" | null>(
    null
  );

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Pending Requests</CardTitle>
          <CardDescription>
            All dataset requests have been reviewed
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Dataset Requests Awaiting Approval</CardTitle>
          <CardDescription>
            {requests.length} request{requests.length !== 1 ? "s" : ""} pending
            review
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Samples Needed</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium max-w-md">
                    <div className="line-clamp-2">{request.title}</div>
                  </TableCell>
                  <TableCell>
                    {request.profiles?.full_name || "Unknown"}
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
    </>
  );
}
