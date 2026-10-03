import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceSystems } from "@/components/evals/workspace-systems";

export default async function SystemsPage() {
  await requirePageIdentity("/workspace/systems");
  return (
    <>
      <WorkspaceSystems />
    </>
  );
}
