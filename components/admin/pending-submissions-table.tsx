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
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { ApprovalDialog } from "./approval-dialog";

interface Submission {
  id: string;
  file_urls?: string[];
  created_at: string;
  dataset_requests?: {
    title: string;
  };
  profiles?: {
    full_name: string;
  };
}

interface PendingSubmissionsTableProps {
  submissions: Submission[];
}

export function PendingSubmissionsTable({
  submissions,
}: PendingSubmissionsTableProps) {
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [dialogType, setDialogType] = useState<"approve" | "reject" | null>(
    null
  );

  if (submissions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Pending Submissions</CardTitle>
          <CardDescription>All submissions have been reviewed</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Contributions Awaiting Review</CardTitle>
          <CardDescription>
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""}{" "}
            pending review
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>Contributor</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium max-w-md">
                    <div className="line-clamp-2">
                      {submission.dataset_requests?.title || "Unknown Dataset"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {submission.profiles?.full_name || "Anonymous"}
                  </TableCell>
                  <TableCell>
                    {submission.file_urls?.length || 0} file(s)
                  </TableCell>
                  <TableCell>
                    {new Date(submission.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setDialogType(null);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
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
                          setSelectedSubmission(submission);
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

      {selectedSubmission && (
        <ApprovalDialog
          open={!!selectedSubmission}
          onClose={() => {
            setSelectedSubmission(null);
            setDialogType(null);
          }}
          item={selectedSubmission}
          type={dialogType || "view"}
          itemType="submission"
        />
      )}
    </>
  );
}
