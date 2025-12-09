"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestDatasetExport, generateSignedExportUrl } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export type ExportRecord = {
  id: string;
  dataset_request_id: string;
  status: string;
  export_type: string;
  created_at: string;
  completed_at: string | null;
};

export function ExportPanel({ datasetId, exports }: { datasetId: string; exports: ExportRecord[] }) {
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
        return;
      }
      toast.success(t("Download ready"));
      window.location.href = result.url;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("Exports")}</p>
          <p className="text-xs text-muted-foreground">{t("Generate filtered downloads")}</p>
        </div>
        <Button onClick={triggerExport} disabled={isPending}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t("New export")}
        </Button>
      </div>
      <div className="space-y-3">
        {exports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-muted-foreground">
            {t("No exports yet.")}
          </div>
        ) : (
          exports.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between rounded-2xl border border-border/70 p-4"
            >
              <div>
                <p className="text-sm font-semibold">{record.export_type || t("Full")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(record.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    record.status === "ready"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : record.status === "failed"
                        ? "bg-rose-500/10 text-rose-600"
                        : "bg-amber-500/10 text-amber-700"
                  }
                >
                  {record.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={record.status !== "ready" || isPending}
                  onClick={() => downloadExport(record.id)}
                >
                  <Download className="mr-2 h-4 w-4" /> {t("Download")}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
