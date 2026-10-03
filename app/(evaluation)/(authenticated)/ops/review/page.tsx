import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ReviewQueue } from "@/components/evals/assessment-review";

export default async function OpsReviewPage() {
  const identity = await requirePageIdentity("/ops/review");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return (
    <>
      <ReviewQueue />
    </>
  );
}
