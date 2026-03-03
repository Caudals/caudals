import { getRequesterDatasetDetail } from "@/lib/actions/requester-actions";
import { getDatasetSubmissionsDetailed } from "@/lib/actions/submission-actions";
import { DatasetWorkspace } from "@/components/requester/datasets/dataset-workspace";
import { FundingCheckoutStatusSync } from "@/components/requester/payments/funding-checkout-status-sync";
import type { SubmissionItem } from "@/components/requester/datasets/submissions-panel";
import { notFound } from "next/navigation";

export default async function RequesterDatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [datasetResult, submissionsResult] = await Promise.all([
    getRequesterDatasetDetail(id),
    getDatasetSubmissionsDetailed(id),
  ]);

  if ("error" in datasetResult) {
    notFound();
  }

  const submissions: SubmissionItem[] =
    "error" in submissionsResult
      ? []
      : (submissionsResult.data ?? []).map((submission) => ({
          id: submission.id,
          status: submission.status,
          notes: submission.notes ?? null,
          file_urls: submission.file_urls ?? [],
          metadata: submission.metadata ?? null,
          created_at: submission.created_at,
          reviewed_at: submission.reviewed_at ?? null,
          profiles: Array.isArray(submission.profiles)
            ? submission.profiles[0]
            : submission.profiles,
        }));

  return (
    <div className="space-y-6">
      <FundingCheckoutStatusSync />
      <DatasetWorkspace detail={datasetResult} submissions={submissions} />
    </div>
  );
}
