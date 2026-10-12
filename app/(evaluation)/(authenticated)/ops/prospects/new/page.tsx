import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { NewProspectSnapshot } from "@/components/evals/prospect-snapshot";
import { prospectSnapshotsEnabled } from "@/lib/evals/repositories/prospects";
import { snapshotLimits } from "@/lib/evals/prospects/policy";

export const dynamic = "force-dynamic";
export default async function NewProspectPage() {
  const identity = await requirePageIdentity("/ops/prospects/new");
  if (!identity.platformRole || !prospectSnapshotsEnabled()) notFound();
  return <NewProspectSnapshot limits={snapshotLimits()} />;
}
