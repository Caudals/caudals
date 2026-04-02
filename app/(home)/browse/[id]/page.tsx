import type { Metadata } from "next";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { getDatasetById } from "@/lib/actions/dataset-actions";
import { getSubmissionsByDatasetRequest } from "@/lib/actions/submission-actions";
import { notFound } from "next/navigation";
import { DatasetDetailClient } from "./dataset-detail-client";
import { buildPublicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getDatasetById(id);

  if (!dataset) {
    return buildPublicMetadata({
      title: "Dataset request",
      description: "Dataset request details on Caudals.",
      pathname: `/browse/${id}`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: dataset.title,
    description: dataset.description.slice(0, 160),
    pathname: `/browse/${id}`,
    noIndex: true,
    keywords: [dataset.category, dataset.dataType, "dataset request", "Caudals"],
  });
}

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
      <Header translucent />
      <DatasetDetailClient dataset={dataset} submissions={submissions} />
      <MarketingFooter />
    </div>
  );
}
