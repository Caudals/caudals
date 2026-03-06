"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportPanel, ExportRecord } from "@/components/requester/datasets/export-panel";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Search } from "lucide-react";

type ExportWithDataset = ExportRecord & {
  dataset_requests?: { title?: string } | null;
};

export function FilesExportsBoard({ records }: { records: ExportWithDataset[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [datasetId, setDatasetId] = useState<string>("all");
  const t = useTranslations();

  const datasetOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records) {
      map.set(record.dataset_request_id, record.dataset_requests?.title || "Dataset");
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [records]);

  const statusOptions = useMemo(() => {
    const set = new Set(records.map((record) => record.status));
    return Array.from(set);
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const matchesQuery = query.trim()
        ? `${record.dataset_requests?.title ?? ""} ${record.export_type} ${record.status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        : true;
      const matchesStatus = status === "all" ? true : record.status === status;
      const matchesDataset =
        datasetId === "all" ? true : record.dataset_request_id === datasetId;
      return matchesQuery && matchesStatus && matchesDataset;
    });
  }, [datasetId, query, records, status]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, { title: string; exports: ExportRecord[] }>>(
      (acc, record) => {
        const id = record.dataset_request_id;
        if (!acc[id]) {
          acc[id] = {
            title: record.dataset_requests?.title || "Dataset",
            exports: [],
          };
        }
        acc[id].exports.push(record);
        return acc;
      },
      {}
    );
  }, [filtered]);

  const groups = Object.entries(grouped);

  return (
    <div className="space-y-6">
      <Card className="shadow-none border-border bg-muted/10 rounded-2xl">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[2fr,1fr,1fr]">
          <div className="space-y-2 relative">
            <Label className="text-xs text-slate-500">{t("Search")}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Dataset, type, or status")}
                className="pl-9 h-10 shadow-none rounded-lg bg-background"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">{t("Status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full h-10 shadow-none rounded-lg bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="all">{t("All statuses")}</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">{t("Dataset")}</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="w-full h-10 shadow-none rounded-lg bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="all">{t("All datasets")}</SelectItem>
                {datasetOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/5 p-12 text-center text-slate-500">
          {t("No exports match your filters.")}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([id, group]) => (
            <Card key={id} className="border-border shadow-none rounded-2xl overflow-hidden bg-background">
              <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
                <CardTitle className="text-base text-foreground">{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ExportPanel datasetId={id} exports={group.exports} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
