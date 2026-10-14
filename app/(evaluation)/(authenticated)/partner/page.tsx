import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { PartnerDashboard } from "@/components/evals/partner-dashboard";
import { partnersMode } from "@/lib/evals/partners/flags";

export const dynamic = "force-dynamic";

/**
 * Partner dashboard (launch L-28, PARTNERS_ENABLED). Partner people open their
 * own partner (`?id=` picks one when they belong to several); platform admins
 * may open any partner by id while the ops API is on. Anyone else gets the
 * not-found page, and every API call is checked again in the database.
 */
export default async function PartnerPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const identity = await requirePageIdentity("/partner");
  const mode = partnersMode();
  if (!mode.admin) notFound();
  const partners = identity.partners ?? [];
  const requested = (await searchParams).id;
  const id = (typeof requested === "string" ? requested : undefined) ?? partners[0]?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!partners.some((partner) => partner.id === id) && identity.platformRole !== "platform_admin") notFound();
  return <PartnerDashboard partnerId={id} partners={partners.map(({ id, name }) => ({ id, name }))} />;
}
