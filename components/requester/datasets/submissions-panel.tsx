"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSubmissionStatus } from "@/lib/actions/submission-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export type SubmissionItem = {
  id: string;
  status: string;
  notes: string | null;
  file_urls?: string[] | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  reviewed_at?: string | null;
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url?: string | null;
  } | null;
};

export function SubmissionsPanel({ submissions }: { submissions: SubmissionItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const statusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return t("Approved");
      case "rejected":
        return t("Rejected");
      case "needs_changes":
        return t("Needs changes");
      case "pending":
        return t("Pending");
      default:
        return status;
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((value) => value !== id)));
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? submissions.map((submission) => submission.id) : []);
  };

  const mutateSelected = (status: "approved" | "rejected" | "needs_changes") => {
    if (selected.length === 0) return;
    let note: string | undefined;
    if (status !== "approved") {
      const response = window.prompt(t("Add reviewer note for selected submissions"));
      if (!response) {
        return;
      }
      note = response;
    }
    startTransition(async () => {
      try {
        await Promise.all(selected.map((id) => updateSubmissionStatus(id, status, note)));
        toast.success(t("Updated {{count}} submissions", { count: selected.length }));
        setSelected([]);
        router.refresh();
      } catch (error) {
        console.error(error);
        toast.error(t("Unable to update submissions"));
      }
    });
  };

  const handleSingleUpdate = (id: string, status: "approved" | "rejected" | "needs_changes") => {
    let note: string | undefined;
    if (status !== "approved") {
      const response = window.prompt(t("Add reviewer note"));
      if (!response) {
        return;
      }
      note = response;
    }
    startTransition(async () => {
      const result = await updateSubmissionStatus(id, status, note);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          t("Submission {{status}}", { status: statusLabel(status) }),
        );
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selected.length === submissions.length && submissions.length > 0}
            onCheckedChange={(value) => toggleAll(Boolean(value))}
          />
          <span>
            {selected.length > 0
              ? t("{{count}} selected", { count: selected.length })
              : t("{{count}} submissions", { count: submissions.length })}
          </span>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => mutateSelected("approved")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> {t("Approve")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => mutateSelected("needs_changes")}
            >
              {t("Request changes")}
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("Contributor")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Notes")}</TableHead>
              <TableHead>{t("Date")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-9 text-center text-muted-foreground">
                  {t("No submissions yet.")}
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(submission.id)}
                      onCheckedChange={(value) => toggleRow(submission.id, Boolean(value))}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {submission.profiles?.full_name ?? t("Unknown")}
                    </div>
                    <p className="text-xs text-muted-foreground">{submission.profiles?.id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        submission.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : submission.status === "rejected"
                            ? "bg-rose-500/10 text-rose-600"
                            : submission.status === "needs_changes"
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-blue-500/10 text-blue-700"
                      }
                    >
                      {statusLabel(submission.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm text-sm text-muted-foreground">
                    {submission.notes || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(submission.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleSingleUpdate(submission.id, "approved")}>
                          {t("Approve")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSingleUpdate(submission.id, "needs_changes")}>
                          {t("Request changes")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSingleUpdate(submission.id, "rejected")}>
                          {t("Reject")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
