import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceReports } from "@/components/evals/workspace-reports";

export default async function ReportsPage() {
  await requirePageIdentity("/workspace/reports");
  return (
    <>
      <WorkspaceReports />
    </>
  );
}
