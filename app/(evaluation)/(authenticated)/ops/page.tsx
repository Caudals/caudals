import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { OperatorOverview } from "@/components/evals/operator-overview";

export default async function OpsPage() {
  const identity = await requirePageIdentity("/ops");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return (
    <>
      <OperatorOverview />
    </>
  );
}
