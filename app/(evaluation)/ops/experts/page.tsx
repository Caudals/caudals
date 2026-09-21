import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { requireStageEPage } from "@/components/evals/expert-page-identity";
import { EvalShell } from "@/components/evals/shell";
import { ExpertManagement } from "@/components/evals/expert-management";

export default async function ExpertManagementPage() {
  requireStageEPage();
  const identity = await requirePageIdentity("/ops/experts");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <EvalShell identity={identity}><ExpertManagement workspaces={identity.workspaces} /></EvalShell>;
}
