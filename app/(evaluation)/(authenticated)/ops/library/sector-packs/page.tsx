import { notFound, redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { OperatorLibrary } from "@/components/evals/operator-library";
import { sectorPacksEnabled } from "@/lib/evals/sector-packs/flags";

// Sector packs (launch L-25): authoring, review state and publication for Caudals staff.
export default async function Page() {
  if (!sectorPacksEnabled()) notFound();
  const identity = await requirePageIdentity("/ops/library/sector-packs");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return (
    <>
      <OperatorLibrary section="sector-packs" improvements={process.env.EVALS_EXPERT_WORK_ENABLED === "true"} sectorPacks />
    </>
  );
}
