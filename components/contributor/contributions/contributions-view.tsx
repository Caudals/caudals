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
  FileCheck,
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
        <Badge variant="secondary" className="shadow-none bg-emerald-50 text-emerald-700 text-[10px] uppercase tracking-wider px-2 border border-emerald-200/50">
          {t("Approved")}
        </Badge>
      );
    }
    if (status === "rejected") {
      return (
        <Badge variant="secondary" className="shadow-none bg-red-50 text-red-700 text-[10px] uppercase tracking-wider px-2 border border-red-200/50">
          {t("Rejected")}
        </Badge>
      );
    }
    if (status === "needs_changes") {
      return (
        <Badge variant="secondary" className="shadow-none bg-amber-50 text-amber-700 text-[10px] uppercase tracking-wider px-2 border border-amber-200/50">
          {t("Needs changes")}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="shadow-none bg-blue-50 text-blue-700 text-[10px] uppercase tracking-wider px-2 border border-blue-200/50">
        {t("Pending")}
      </Badge>
    );
  };

  const approvalRate =
    earnings.totalSubmissions > 0
      ? (earnings.approvedSubmissions / earnings.totalSubmissions) * 100
      : 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Earnings Overview */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="shadow-none border-border bg-emerald-50/50 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-emerald-100/50 mb-3 mx-2 mt-2">
            <CardTitle className="text-xs uppercase tracking-wider text-emerald-800 font-medium">
              {t("Total Earnings")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-emerald-700">
              ${earnings.totalEarnings.toFixed(2)}
            </div>
            <p className="text-[11px] text-emerald-700/80 font-medium mt-1">
              {t("From {{count}} approved submissions", { count: earnings.approvedSubmissions })}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-200 mb-3 mx-2 mt-2">
            <CardTitle className="text-xs uppercase tracking-wider text-slate-500 font-medium">{t("Pending")}</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-foreground">
              {earnings.pendingSubmissions}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              <span className="text-blue-600 font-semibold">${earnings.pendingEarnings.toFixed(2)}</span> {t("potential payout")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-amber-50/50 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-amber-100/50 mb-3 mx-2 mt-2">
            <CardTitle className="text-xs uppercase tracking-wider text-amber-800 font-medium">{t("Needs Changes")}</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-amber-700">
              {earnings.needsChangesSubmissions || 0}
            </div>
            <p className="text-[11px] text-amber-700/80 font-medium mt-1">
              {t("Reviewer feedback waiting for revision")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-200 mb-3 mx-2 mt-2">
            <CardTitle className="text-xs uppercase tracking-wider text-slate-500 font-medium">{t("Approval Rate")}</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-foreground">{approvalRate.toFixed(1)}%</div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {earnings.approvedSubmissions}/{earnings.totalSubmissions}{" "}
              {t("approved")}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-red-50/50 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-red-100/50 mb-3 mx-2 mt-2">
            <CardTitle className="text-xs uppercase tracking-wider text-red-800 font-medium">{t("Rejected")}</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="text-3xl font-bold text-destructive">
              {earnings.rejectedSubmissions}
            </div>
            <p className="text-[11px] text-red-700/80 font-medium mt-1">
              {t("Review feedback to improve")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contributions Table */}
      <Card className="shadow-none border-border bg-background rounded-2xl overflow-hidden py-0 gap-0">
        <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">{t("All Contributions")}</CardTitle>
              <CardDescription>
                {t("Your submission history across all datasets")}
              </CardDescription>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 border border-border rounded-lg px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none bg-background shadow-none min-w-[150px]"
            >
              <option value="all">{t("All Status")}</option>
              <option value="pending">{t("Pending")}</option>
              <option value="needs_changes">{t("Needs changes")}</option>
              <option value="approved">{t("Approved")}</option>
              <option value="rejected">{t("Rejected")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredContributions.length === 0 ? (
            <div className="text-center py-16">
              <FileCheck className="h-10 w-10 text-slate-500/30 mx-auto mb-3" />
              <p className="font-medium text-foreground">{t("No contributions yet")}</p>
              <p className="text-sm text-slate-500 mt-1">{t("Start contributing to datasets!")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-medium text-slate-500 py-4 pl-6">{t("Dataset")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">{t("Files")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">{t("Status")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">{t("Reward")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">{t("Feedback")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4">{t("Submitted")}</TableHead>
                  <TableHead className="font-medium text-slate-500 py-4 text-right pr-6">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContributions.map((contribution) => {
                  const dataset = Array.isArray(contribution.dataset_requests)
                    ? contribution.dataset_requests[0]
                    : contribution.dataset_requests;

                  return (
                    <TableRow key={contribution.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200">
                      <TableCell className="font-medium max-w-[240px] pl-6 py-4">
                        <div className="line-clamp-2 text-sm text-foreground">
                          {dataset?.title || t("Unknown")}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500/70 mt-1">
                          {dataset?.data_type || "File"}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-muted/50 text-xs font-mono text-slate-500 border border-slate-200">
                          {contribution.file_urls?.length || 0} {t("file(s)")}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        {getStatusBadge(contribution.status)}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="font-medium text-foreground">${dataset?.reward_amount || 0}</span>{" "}
                        <span className="text-xs text-slate-500">{dataset?.currency || "USD"}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] py-4">
                        {(contribution.status === "rejected" ||
                          contribution.status === "needs_changes") &&
                        contribution.notes ? (
                          <div className={`line-clamp-2 text-xs p-2 rounded-lg border ${contribution.status === 'rejected' ? 'bg-red-50/50 border-red-100 text-red-800' : 'bg-amber-50/50 border-amber-100 text-amber-800'}`}>
                            {contribution.notes}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 py-4">
                        {new Date(contribution.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right py-4 pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
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
                              className="text-sm"
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
                              className="text-sm"
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
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 text-sm"
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
                                    className="text-sm"
                                  >
                                    {t("Read full feedback")}
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
