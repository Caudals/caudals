import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ProspectSnapshots } from "@/components/evals/prospect-snapshot";
import { prospectSnapshotsEnabled } from "@/lib/evals/repositories/prospects";

export const dynamic = "force-dynamic";
export default async function ProspectsPage() {
  const identity = await requirePageIdentity("/ops/prospects");
  if (!identity.platformRole || !prospectSnapshotsEnabled()) notFound();
  return <ProspectSnapshots />;
}
