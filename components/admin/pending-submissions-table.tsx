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
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { ApprovalDialog } from "./approval-dialog";
import { useTranslations } from "@/lib/i18n/use-translations";

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
  const t = useTranslations();

  if (submissions.length === 0) {
    return (
      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
        <CardContent className="py-16 text-center">
          <div className="flex flex-col items-center justify-center">
            <CheckCircle className="h-10 w-10 text-emerald-500/50 mb-4" />
            <p className="text-foreground font-medium">{t("All caught up!")}</p>
            <p className="text-sm text-slate-500 mt-1">{t("No Pending Submissions. All submissions have been reviewed.")}</p>
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
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">{t("Dataset")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Contributor")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Files")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">{t("Submitted")}</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="font-medium max-w-[280px] pl-8 py-4">
                    <div className="line-clamp-2 text-sm text-slate-900">
                      {submission.dataset_requests?.title || t("Unknown Dataset")}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-sm text-slate-700">{submission.profiles?.full_name || t("Anonymous")}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-slate-100 text-xs font-mono text-slate-600 border border-slate-200">
                      {submission.file_urls?.length || 0} {t("file(s)")}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-500">
                    {new Date(submission.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </TableCell>
                  <TableCell className="py-4 pr-8 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        title={t("View Evidence")}
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setDialogType(null);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-slate-200 mx-1"></div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Reject")}
                        onClick={() => {
                          setSelectedSubmission(submission);
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
                          setSelectedSubmission(submission);
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
