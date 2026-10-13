import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { BillingTopUp } from "@/components/evals/billing-top-up";
import { paymentsAccess } from "@/lib/billing/payments-config";

export const dynamic = "force-dynamic";

// Buying credits (launch L-12). Only owners of workspaces with payments open
// see it: in Stripe test mode, the internal workspaces in
// BILLING_TEST_WORKSPACE_IDS; in live mode, every owner once
// BILLING_CREDITS_ENABLED is on. Everyone else gets the not-found page.
export default async function TopUpPage() {
  const identity = await requirePageIdentity("/workspace/billing/top-up");
  const allowed = identity.workspaces.filter(workspace => workspace.role === "owner" && paymentsAccess(workspace.id) !== "closed").map(workspace => workspace.id);
  if (!allowed.length) notFound();
  return <BillingTopUp allowedOrgIds={allowed} />;
}
