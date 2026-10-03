import { ExpertWorkbench } from "@/components/evals/expert-workbench";
import { requireExpertPageIdentity } from "@/components/evals/expert-page-identity";

export default async function ExpertAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireExpertPageIdentity("/review");
  return <><ExpertWorkbench assignmentId={(await params).id} /></>;
}
