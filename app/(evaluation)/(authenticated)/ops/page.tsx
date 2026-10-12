import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { OperatorOverview } from "@/components/evals/operator-overview";
import { getOpsKpis } from "@/lib/analytics/ops-kpis";
import { analyticsV2Enabled } from "@/lib/analytics/funnel-events-server";

export const dynamic = "force-dynamic";
export default async function OpsPage() {
  const identity = await requirePageIdentity("/ops");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  // Growth KPIs and demo health (launch L-21); the page renders without them if they fail.
  const kpis = await getOpsKpis(identity);
  return (
    <>
      <OperatorOverview kpis={kpis} growth={analyticsV2Enabled()} />
    </>
  );
}
