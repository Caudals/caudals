"use client";

import { useState } from "react";
import { Dataset } from "@/types/dataset";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  FileDown,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Eye,
  FileText,
} from "lucide-react";
import {
  updateSubmissionStatus,
  bulkApproveSubmissions,
} from "@/lib/actions/submission-actions";
import {
  exportDatasetToCSV,
  exportDatasetToJSON,
} from "@/lib/actions/export-actions";
import { FilePreviewDialog } from "./file-preview-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";

interface RequesterDatasetDetailProps {
  dataset: Dataset;
  submissions: Array<{
    id: string;
    status: string;
    file_urls?: string[];
    notes?: string;
    created_at: string;
    profiles?: {
      id: string;
      full_name: string;
      avatar_url?: string;
    };
  }>;
}

export function RequesterDatasetDetail({
  dataset,
  submissions,
}: RequesterDatasetDetailProps) {
  const router = useRouter();
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [previewFiles, setPreviewFiles] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const progress = (dataset.samplesCollected / dataset.samplesNeeded) * 100;

  const filteredSubmissions = submissions.filter(
    (sub) => statusFilter === "all" || sub.status === statusFilter
  );

  const handleApprove = async (submissionId: string) => {
    const result = await updateSubmissionStatus(submissionId, "approved");
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Submission approved!");
      router.refresh();
    }
  };

  const handleReject = async (submissionId: string) => {
    const reason = prompt("Reason for rejection:");
    if (!reason) return;

    const result = await updateSubmissionStatus(
      submissionId,
      "rejected",
      reason
    );
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Submission rejected");
      router.refresh();
    }
  };

  const handleBulkApprove = async () => {
    if (selectedSubmissions.length === 0) {
      toast.error("No submissions selected");
      return;
    }

    const result = await bulkApproveSubmissions(selectedSubmissions);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`${selectedSubmissions.length} submissions approved!`);
      setSelectedSubmissions([]);
      router.refresh();
    }
  };

  const handleExportCSV = async () => {
    const result = await exportDatasetToCSV(
      dataset.id,
      statusFilter === "all" ? undefined : statusFilter
    );
    if ("error" in result) {
      toast.error(result.error);
    } else if (result.data) {
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || "export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully!");
    }
  };

  const handleExportJSON = async () => {
    const result = await exportDatasetToJSON(dataset.id);
    if ("error" in result) {
      toast.error(result.error);
    } else if (result.data) {
      const blob = new Blob([result.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || "export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON exported successfully!");
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "approved") {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-700">Approved</Badge>
      );
    }
    if (status === "rejected") {
      return <Badge className="bg-red-500/10 text-red-700">Rejected</Badge>;
    }
    return <Badge className="bg-blue-500/10 text-blue-700">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(progress)}%</div>
            <Progress value={progress} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {dataset.samplesCollected} / {dataset.samplesNeeded} samples
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submissions.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              All contributors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions.filter((s) => s.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Awaiting action
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Active Contributors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataset.activeContributors}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Unique users</p>
          </CardContent>
        </Card>
      </div>

      {/* Dataset Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dataset Information</CardTitle>
              <CardDescription>
                <div className="flex gap-2 mt-2">
                  <Badge>{categoryLabels[dataset.category]}</Badge>
                  <Badge variant="outline">
                    {dataTypeLabels[dataset.dataType]}
                  </Badge>
                  <Badge variant="secondary">
                    {statusLabels[dataset.status]}
                  </Badge>
                </div>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportJSON}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{dataset.description}</p>
          <Separator className="my-4" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Reward per sample:</span>
              <span className="ml-2 font-medium">
                {dataset.currency} {dataset.rewardAmount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Deadline:</span>
              <span className="ml-2 font-medium">
                {new Date(dataset.deadline).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardDescription>
                Review and manage contributor submissions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              {selectedSubmissions.length > 0 && (
                <Button onClick={handleBulkApprove} size="sm">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve Selected ({selectedSubmissions.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No submissions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedSubmissions.length ===
                          filteredSubmissions.length &&
                        filteredSubmissions.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSubmissions(
                            filteredSubmissions.map((s) => s.id)
                          );
                        } else {
                          setSelectedSubmissions([]);
                        }
                      }}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => {
                  const profile = Array.isArray(submission.profiles)
                    ? submission.profiles[0]
                    : submission.profiles;

                  return (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedSubmissions.includes(submission.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSubmissions([
                                ...selectedSubmissions,
                                submission.id,
                              ]);
                            } else {
                              setSelectedSubmissions(
                                selectedSubmissions.filter(
                                  (id) => id !== submission.id
                                )
                              );
                            }
                          }}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            {profile?.avatar_url && (
                              <AvatarImage src={profile.avatar_url} />
                            )}
                            <AvatarFallback className="text-xs">
                              {profile?.full_name
                                ?.substring(0, 2)
                                .toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {profile?.full_name || "Anonymous"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {submission.file_urls?.length || 0} files
                      </TableCell>
                      <TableCell>{getStatusBadge(submission.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                if (
                                  submission.file_urls &&
                                  submission.file_urls.length > 0
                                ) {
                                  setPreviewFiles(submission.file_urls);
                                  setPreviewOpen(true);
                                }
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Files
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                // Download files
                                submission.file_urls?.forEach((url) => {
                                  window.open(url, "_blank");
                                });
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download Files
                            </DropdownMenuItem>
                            <Separator className="my-1" />
                            {submission.status === "pending" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleApprove(submission.id)}
                                  className="text-emerald-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleReject(submission.id)}
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* File Preview Dialog */}
      <FilePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fileUrls={previewFiles}
        title="Submission Files"
      />
    </div>
  );
}
