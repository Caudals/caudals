import { notFound, redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { requireStageEPage } from "@/components/evals/expert-page-identity";
import { ReviewRequestDetail } from "@/components/evals/expert-reviews";
import { expertReviewOrdersEnabled } from "@/lib/evals/domain/features";

/** One expert-review request: CRM draft, order, assignments and the reviewed revision (launch L-26). */
export default async function ExpertReviewRequestPage({ params }: { params: Promise<{ id: string }> }) {
  requireStageEPage();
  if (!expertReviewOrdersEnabled()) notFound();
  const identity = await requirePageIdentity("/ops/experts");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <ReviewRequestDetail requestId={(await params).id} />;
}
