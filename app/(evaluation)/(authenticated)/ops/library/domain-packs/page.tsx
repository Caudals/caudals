import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { OperatorLibrary } from "@/components/evals/operator-library";

export default async function Page() {
  const identity = await requirePageIdentity("/ops/library/domain-packs");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return (
    <>
      <OperatorLibrary section="domain-packs" improvements={process.env.EVALS_EXPERT_WORK_ENABLED === "true"} />
    </>
  );
}
