"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  MoreHorizontal,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import { deleteOwnSubmission } from "@/lib/actions/contributor-actions";
import { useRouter } from "next/navigation";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

interface ContributionsViewProps {
  contributions: Array<{
    id: string;
    status: string;
    file_urls?: string[];
    notes?: string;
    created_at: string;
    dataset_requests?: {
      id: string;
      title: string;
      reward_amount: number;
      currency: string;
      data_type: string;
      status: string;
    };
  }>;
  earnings: {
    totalEarnings: number;
    pendingEarnings: number;
    approvedSubmissions: number;
    pendingSubmissions: number;
    needsChangesSubmissions?: number;
    rejectedSubmissions: number;
    totalSubmissions: number;
  };
}

export function ContributionsView({
  contributions,
  earnings,
}: ContributionsViewProps) {
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredContributions = contributions.filter(
    (c) => statusFilter === "all" || c.status === statusFilter
  );

  const handleDelete = async (submissionId: string) => {
    if (!confirm(t("Delete this submission? This cannot be undone."))) {
      return;
    }

    const result = await deleteOwnSubmission(submissionId);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Submission deleted");
      router.refresh();
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "approved") {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
          {t("Approved")}
        </Badge>
      );
    }
    if (status === "rejected") {
      return (
        <Badge className="bg-red-500/10 text-red-700 border-red-500/20">
          {t("Rejected")}
        </Badge>
      );
    }
    if (status === "needs_changes") {
      return (
        <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20">
          {t("Needs changes")}
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20">
        {t("Pending")}
      </Badge>
    );
  };

  const approvalRate =
    earnings.totalSubmissions > 0
      ? (earnings.approvedSubmissions / earnings.totalSubmissions) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Earnings Overview */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="shadow-sm border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Total Earnings")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ${earnings.totalEarnings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("From {{count}} approved submissions", { count: earnings.approvedSubmissions })}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("Pending")}</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {earnings.pendingSubmissions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${earnings.pendingEarnings.toFixed(2)} {t("potential payout")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("Needs Changes")}</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {earnings.needsChangesSubmissions || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Reviewer feedback waiting for revision")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("Approval Rate")}</CardTitle>
            <CheckCircle className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvalRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {earnings.approvedSubmissions}/{earnings.totalSubmissions}{" "}
              {t("approved")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("Rejected")}</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {earnings.rejectedSubmissions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Review feedback to improve")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contributions Table */}
      <Card className="shadow-sm border-border bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("All Contributions")}</CardTitle>
              <CardDescription>
                {t("Your submission history across all datasets")}
              </CardDescription>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="all">{t("All Status")}</option>
              <option value="pending">{t("Pending")}</option>
              <option value="needs_changes">{t("Needs changes")}</option>
              <option value="approved">{t("Approved")}</option>
              <option value="rejected">{t("Rejected")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredContributions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("No contributions yet. Start contributing to datasets!")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Dataset")}</TableHead>
                  <TableHead>{t("Files")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Reward")}</TableHead>
                  <TableHead>{t("Feedback")}</TableHead>
                  <TableHead>{t("Submitted")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContributions.map((contribution) => {
                  const dataset = Array.isArray(contribution.dataset_requests)
                    ? contribution.dataset_requests[0]
                    : contribution.dataset_requests;

                  return (
                    <TableRow key={contribution.id}>
                      <TableCell className="font-medium max-w-xs">
                        <div className="line-clamp-2">
                          {dataset?.title || t("Unknown")}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contribution.file_urls?.length || 0} files
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(contribution.status)}
                      </TableCell>
                      <TableCell>
                        ${dataset?.reward_amount || 0}{" "}
                        {dataset?.currency || "USD"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {(contribution.status === "rejected" ||
                          contribution.status === "needs_changes") &&
                        contribution.notes ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {contribution.notes}
                          </p>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(contribution.created_at).toLocaleDateString()}
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
                                  contribution.file_urls &&
                                  contribution.file_urls.length > 0
                                ) {
                                  window.open(
                                    contribution.file_urls[0],
                                    "_blank"
                                  );
                                }
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              {t("View Files")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                contribution.file_urls?.forEach((url) => {
                                  window.open(url, "_blank");
                                });
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              {t("Download")}
                            </DropdownMenuItem>
                            {(contribution.status === "pending" ||
                              contribution.status === "needs_changes") && (
                              <>
                                <Separator className="my-1" />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(contribution.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("Delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                            {(contribution.status === "rejected" ||
                              contribution.status === "needs_changes") &&
                              contribution.notes && (
                                <>
                                  <Separator className="my-1" />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      alert(
                                        t("Rejection reason: {{reason}}", {
                                          reason: contribution.notes as string,
                                        }),
                                      );
                                    }}
                                  >
                                    {t("View Feedback")}
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
    </div>
  );
}
