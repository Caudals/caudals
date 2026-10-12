import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ProspectSnapshotDetail } from "@/components/evals/prospect-snapshot";
import { prospectSnapshotsEnabled } from "@/lib/evals/repositories/prospects";

export const dynamic = "force-dynamic";
export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePageIdentity("/ops/prospects");
  const { id } = await params;
  if (!identity.platformRole || !prospectSnapshotsEnabled() || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <ProspectSnapshotDetail id={id} />;
}
