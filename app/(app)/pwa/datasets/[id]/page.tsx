import { notFound } from "next/navigation";
import { getDatasetById } from "@/lib/actions/dataset-actions";
import { getSubmissionsByDatasetRequest } from "@/lib/actions/submission-actions";
import { PwaDatasetDetailClient } from "@/components/pwa/pwa-dataset-detail-client";

export default async function PwaDatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataset = await getDatasetById(id);

  if (!dataset) {
    notFound();
  }

  const submissions = await getSubmissionsByDatasetRequest(id);

  return (
    <PwaDatasetDetailClient dataset={dataset} submissions={submissions} />
  );
}
