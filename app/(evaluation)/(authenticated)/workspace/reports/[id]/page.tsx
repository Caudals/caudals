import { requirePageIdentity } from "@/components/evals/page-identity";
import { AuthenticatedReport } from "@/components/evals/report-view";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/reports");
  return (
    <>
      <AuthenticatedReport reportId={(await params).id} />
    </>
  );
}
