import { notFound } from "next/navigation";
import {
  getDatasetTemplates,
  getRequesterDatasetDetail,
} from "@/lib/actions/requester-actions";
import { DatasetBuilder, DuplicateDataset } from "@/components/requester/datasets/dataset-builder";

export default async function EditRequesterDatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [datasetResult, templatesResult] = await Promise.all([
    getRequesterDatasetDetail(id),
    getDatasetTemplates(),
  ]);

  if ("error" in datasetResult) {
    notFound();
  }

  const templates = Array.isArray(templatesResult) ? templatesResult : [];
  const initial = datasetResult.dataset as DuplicateDataset | undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Edit dataset</p>
        <h1 className="text-2xl font-semibold">Update brief</h1>
      </div>
      <DatasetBuilder templates={templates} duplicate={initial} datasetId={id} />
    </div>
  );
}
