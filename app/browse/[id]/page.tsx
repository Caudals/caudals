import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { getDatasetById } from "@/lib/actions/dataset-actions";
import { getSubmissionsByDatasetRequest } from "@/lib/actions/submission-actions";
import { notFound } from "next/navigation";
import { DatasetDetailClient } from "./dataset-detail-client";

export default async function DatasetDetailPage({
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
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <DatasetDetailClient dataset={dataset} submissions={submissions} />
      <MarketingFooter />
    </div>
  );
}
