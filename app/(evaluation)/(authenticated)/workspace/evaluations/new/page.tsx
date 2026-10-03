import { requirePageIdentity } from "@/components/evals/page-identity";
import { NewEvaluationFlow } from "@/components/evals/workspace-evaluations";

export default async function NewEvaluationPage() {
  await requirePageIdentity("/workspace/evaluations/new");
  return (
    <>
      <NewEvaluationFlow />
    </>
  );
}
