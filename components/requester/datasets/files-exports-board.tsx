"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportPanel, ExportRecord } from "@/components/requester/datasets/export-panel";
import { useTranslations } from "@/lib/i18n/use-translations";

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
      <Card className="bg-white shadow-sm border border-border">
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{t("Search")}</Label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Dataset, type, or status")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("Status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
            <Label>{t("Dataset")}</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("No exports match your filters.")}
        </div>
      ) : (
        groups.map(([id, group]) => (
          <Card key={id} className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ExportPanel datasetId={id} exports={group.exports} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
