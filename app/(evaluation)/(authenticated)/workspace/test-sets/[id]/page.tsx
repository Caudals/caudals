import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceTestSetEditor } from "@/components/evals/workspace-test-sets";

export default async function TestSetEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageIdentity("/workspace/test-sets");
  return (
    <>
      <WorkspaceTestSetEditor suiteId={(await params).id} />
    </>
  );
}
