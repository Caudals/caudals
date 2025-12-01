import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { getDatasetById } from "@/lib/actions/dataset-actions";
import { getDatasetSubmissionsDetailed } from "@/lib/actions/submission-actions";
import { notFound } from "next/navigation";
import { RequesterDatasetDetail } from "@/components/dashboard/requester-dataset-detail";
import { getDatasetBudgetSummary } from "@/lib/actions/payment-actions";

export default async function RequesterDatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataset = await getDatasetById(id);
  const submissionsResult = await getDatasetSubmissionsDetailed(id);
  const budgetSummary = await getDatasetBudgetSummary(id);

  if (!dataset) {
    notFound();
  }

  const submissions =
    "error" in submissionsResult ? [] : submissionsResult.data || [];

  return (
    <>
      <DashboardHeader title={dataset.title} />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <RequesterDatasetDetail
          dataset={dataset}
          submissions={submissions}
          budgetSummary={budgetSummary.data ?? null}
        />
      </div>
    </>
  );
}
