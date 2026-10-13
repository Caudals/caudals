import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { BillingTopUp } from "@/components/evals/billing-top-up";
import { resolvePaymentsAccess } from "@/lib/billing/payments-config";

export const dynamic = "force-dynamic";

// Buying credits (launch L-12). Only owners of workspaces with payments open
// see it: in Stripe test mode, the internal workspaces in
// BILLING_TEST_WORKSPACE_IDS; in live mode with BILLING_CREDITS_ENABLED on,
// the workspaces an admin allowlisted (L-14) and, from Gate B
// (PLANS_V2_ENABLED), every owner. Everyone else gets the not-found page.
export default async function TopUpPage() {
  const identity = await requirePageIdentity("/workspace/billing/top-up");
  const owned = identity.workspaces.filter(workspace => workspace.role === "owner").map(workspace => workspace.id);
  const access = await resolvePaymentsAccess(owned, process.env, { actorId: identity.user.id });
  const allowed = owned.filter(id => access.get(id) !== "closed");
  if (!allowed.length) notFound();
  return <BillingTopUp allowedOrgIds={allowed} />;
}
