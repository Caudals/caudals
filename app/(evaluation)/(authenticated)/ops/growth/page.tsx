import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { OpsGrowth } from "@/components/evals/ops-growth";
import { getGrowth } from "@/lib/analytics/growth";
import { analyticsV2Enabled } from "@/lib/analytics/funnel-events-server";
export const dynamic = "force-dynamic";
export default async function GrowthPage() {
  const identity = await requirePageIdentity("/ops/growth");
  if (!identity.platformRole || !analyticsV2Enabled()) notFound();
  return <OpsGrowth data={await getGrowth(identity)} />;
}
