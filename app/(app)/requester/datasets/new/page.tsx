import { DatasetBuilder, DuplicateDataset } from "@/components/requester/datasets/dataset-builder";
import { getDatasetTemplates, getRequesterDatasetDetail } from "@/lib/actions/requester-actions";

export default async function NewDatasetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const templatesResult = await getDatasetTemplates();
  const templates = Array.isArray(templatesResult) ? templatesResult : [];

  let duplicate: DuplicateDataset | null = null;
  if (typeof params.duplicate === "string") {
    const draft = await getRequesterDatasetDetail(params.duplicate);
    if (!("error" in draft)) {
      duplicate = draft.dataset as DuplicateDataset;
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">New dataset</p>
        <h1 className="text-2xl font-semibold">Launch a dataset brief</h1>
      </div>
      <DatasetBuilder templates={templates} duplicate={duplicate ?? undefined} />
    </div>
  );
}
