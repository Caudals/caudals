import { EvalShell } from "@/components/evals/shell";
import { ExpertWorkbench } from "@/components/evals/expert-workbench";
import { requireExpertPageIdentity } from "@/components/evals/expert-page-identity";

export default async function ExpertAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { identity } = await requireExpertPageIdentity("/review");
  return <EvalShell identity={identity} expert><ExpertWorkbench assignmentId={(await params).id} /></EvalShell>;
}
