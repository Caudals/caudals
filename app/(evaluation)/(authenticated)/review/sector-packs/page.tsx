import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { SectorPackLibrary } from "@/components/evals/sector-packs";
import { sectorPacksEnabled } from "@/lib/evals/sector-packs/flags";
import { packRole } from "@/lib/evals/sector-packs/store";

// Sector pack drafting and review for verified experts (launch L-25, P-31). Staff may open it too.
export default async function Page() {
  if (!sectorPacksEnabled()) notFound();
  const identity = await requirePageIdentity("/review/sector-packs");
  const role = await packRole(identity.user.id, identity.platformRole);
  if (!role.staff && !role.expert) notFound();
  return (
    <>
      <SectorPackLibrary mode="expert" />
    </>
  );
}
