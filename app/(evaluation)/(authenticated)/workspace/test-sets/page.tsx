import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceTestSets } from "@/components/evals/workspace-test-sets";

export default async function TestSetsPage() {
  await requirePageIdentity("/workspace/test-sets");
  return (
    <>
      <WorkspaceTestSets />
    </>
  );
}
