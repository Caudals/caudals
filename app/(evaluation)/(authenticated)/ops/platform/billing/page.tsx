import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { PlatformConsole } from "@/components/evals/platform-console";
import { isBillingView } from "@/components/evals/ops-billing-views";

// Ops billing console (launch L-16, spec v2 §6.13): platform admins only; every
// action also needs a recent sign-in and is audited on the server.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requirePageIdentity("/ops/platform/billing");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  const params = await searchParams;
  const view = typeof params.view === "string" && isBillingView(params.view) ? params.view : "accounts";
  const org = typeof params.org === "string" && /^[0-9a-f-]{36}$/i.test(params.org) ? params.org : null;
  return <><PlatformConsole section="billing" admin={identity.platformRole === "platform_admin"} billingView={view} userId={identity.user.id} initialOrgId={org} /></>;
}
