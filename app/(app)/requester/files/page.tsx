import { getDatasetExports } from "@/lib/actions/requester-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportPanel, ExportRecord } from "@/components/requester/datasets/export-panel";

export default async function FilesDownloadsPage() {
  const exportsResult = await getDatasetExports();

  if (!Array.isArray(exportsResult)) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {exportsResult.error}
      </div>
    );
  }

  type ExportWithDataset = ExportRecord & { dataset_requests?: { title?: string } | null };
  const grouped = exportsResult.reduce<Record<string, { title: string; exports: ExportRecord[] }>>(
    (acc, record) => {
      const datasetRecord = record as ExportWithDataset;
      const datasetId = datasetRecord.dataset_request_id;
      const title = datasetRecord.dataset_requests?.title || "Dataset";
      if (!acc[datasetId]) {
        acc[datasetId] = { title, exports: [] };
      }
      acc[datasetId].exports.push(record);
      return acc;
    },
    {}
  );

  const datasetEntries = Object.entries(grouped);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Files & downloads</p>
        <h1 className="text-2xl font-semibold">Exports</h1>
      </div>
      {datasetEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exports yet.</p>
      ) : (
        <Tabs defaultValue={datasetEntries[0][0]} className="space-y-6">
          <TabsList className="flex-wrap">
            {datasetEntries.map(([id, info]) => (
              <TabsTrigger key={id} value={id}>
                {info.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {datasetEntries.map(([id, info]) => (
            <TabsContent key={id} value={id}>
              <ExportPanel datasetId={id} exports={info.exports} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
