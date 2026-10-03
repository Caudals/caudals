import { ExpertAssignmentQueue } from "@/components/evals/expert-workbench";
import { requireExpertPageIdentity } from "@/components/evals/expert-page-identity";

export default async function ExpertQueuePage() {
  await requireExpertPageIdentity("/review");
  return <><ExpertAssignmentQueue /></>;
}
