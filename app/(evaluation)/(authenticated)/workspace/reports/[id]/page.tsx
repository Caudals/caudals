import { requirePageIdentity } from "@/components/evals/page-identity";
import { AuthenticatedReport } from "@/components/evals/report-view";
import { callUrl } from "@/lib/email/links";
import { getMarketingSiteOrigin } from "@/lib/seo";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/reports");
  // Read at request time: CALCOM_LINK changes without a rebuild.
  return <AuthenticatedReport reportId={(await params).id} readoutUrl={callUrl()} marketingOrigin={getMarketingSiteOrigin()} />;
}
