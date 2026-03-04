"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  requestDatasetExport,
  generateSignedExportUrl,
} from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export type ExportRecord = {
  id: string;
  dataset_request_id: string;
  status: string;
  export_type: string;
  created_at: string;
  completed_at: string | null;
  size_bytes?: number | null;
  progress?: number | null;
  error?: string | null;
  expires_at?: string | null;
};

const STATUS_TONE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-rose-500/10 text-rose-600",
  expired: "bg-amber-500/10 text-amber-700",
  cancelled: "bg-zinc-500/10 text-zinc-600",
  preparing: "bg-blue-500/10 text-blue-700",
  pending: "bg-blue-500/10 text-blue-700",
};

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return "—";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function ExportPanel({
  datasetId,
  exports,
}: {
  datasetId: string;
  exports: ExportRecord[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const triggerExport = () => {
    startTransition(async () => {
      const result = await requestDatasetExport(datasetId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(t("Export started"));
        router.refresh();
      }
    });
  };

  const downloadExport = (exportId: string) => {
    startTransition(async () => {
      const result = await generateSignedExportUrl(exportId);
      if ("error" in result) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(t("Download ready"));
      window.location.assign(result.url);
    });
  };

  const retryExport = () => {
    triggerExport();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("Exports")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Track export state, errors, and expiration windows")}
          </p>
        </div>
        <Button onClick={triggerExport} disabled={isPending}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t("New export")}
        </Button>
      </div>
      <div className="space-y-3">
        {exports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            {t("No exports yet.")}
          </div>
        ) : (
          exports.map((record) => {
            const isExpired = record.status === "expired";
            const canDownload = record.status === "ready" && !isExpired;
            const canRetry =
              record.status === "failed" ||
              record.status === "expired" ||
              record.status === "cancelled";

            return (
              <div
                key={record.id}
                className="space-y-3 rounded-2xl border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {record.export_type || t("Full")} export
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(record.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={STATUS_TONE[record.status] ?? "bg-muted text-muted-foreground"}
                    >
                      {record.status}
                    </Badge>
                    {isExpired ? (
                      <Badge variant="outline">{t("Expired")}</Badge>
                    ) : null}
                  </div>
                </div>

                {(record.status === "pending" || record.status === "preparing") && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("Preparing export")}</span>
                      <span>{record.progress ?? 0}%</span>
                    </div>
                    <Progress value={record.progress ?? 0} />
                  </div>
                )}

                {record.error ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-700">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{record.error}</span>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <p>{t("Size")}: {formatBytes(record.size_bytes)}</p>
                  <p>
                    {t("Completed")}:
                    {" "}
                    {record.completed_at
                      ? new Date(record.completed_at).toLocaleString()
                      : "—"}
                  </p>
                  <p>
                    {t("Expires")}:
                    {" "}
                    {record.expires_at
                      ? new Date(record.expires_at).toLocaleString()
                      : "—"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canDownload || isPending}
                    onClick={() => downloadExport(record.id)}
                  >
                    <Download className="mr-2 h-4 w-4" /> {t("Download")}
                  </Button>
                  {canRetry ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={retryExport}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      {t("Retry")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
