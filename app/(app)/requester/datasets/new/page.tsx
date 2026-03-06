import { DatasetBuilder, DuplicateDataset } from "@/components/requester/datasets/dataset-builder";
import { getDatasetTemplates, getRequesterDatasetDetail } from "@/lib/actions/requester-actions";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

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
      <RequesterPageHeader
        title="Launch a dataset brief"
        description="Define requirements, rewards, and quality controls before opening submissions."
      />
      <DatasetBuilder templates={templates} duplicate={duplicate ?? undefined} />
    </div>
  );
}
