import { EvalShell } from "@/components/evals/shell";
import { ExpertAssignmentQueue } from "@/components/evals/expert-workbench";
import { requireExpertPageIdentity } from "@/components/evals/expert-page-identity";

export default async function ExpertQueuePage() {
  const { identity } = await requireExpertPageIdentity("/review");
  return <EvalShell identity={identity} expert><ExpertAssignmentQueue /></EvalShell>;
}
