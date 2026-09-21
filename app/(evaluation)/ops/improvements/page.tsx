import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { requireStageEPage } from "@/components/evals/expert-page-identity";
import { EvalShell } from "@/components/evals/shell";
import { ImprovementDatasets } from "@/components/evals/improvement-datasets";

export default async function ImprovementDatasetsPage() {
  requireStageEPage();
  const identity = await requirePageIdentity("/ops/improvements");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <EvalShell identity={identity}><ImprovementDatasets workspaces={identity.workspaces} /></EvalShell>;
}
