import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { TopUpReturn } from "@/components/evals/billing-top-up";
import { paymentsAccessFor } from "@/lib/billing/payments-config";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Where Stripe Checkout returns (success and cancel): the order's live status.
export default async function TopUpReturnPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const orgId = typeof query.orgId === "string" ? query.orgId : "";
  const checkout = query.checkout === "success" || query.checkout === "canceled" ? query.checkout : null;
  const identity = await requirePageIdentity(`/workspace/billing/top-ups/${UUID.test(id) ? id : ""}?orgId=${UUID.test(orgId) ? orgId : ""}${checkout ? `&checkout=${checkout}` : ""}`);
  if (!UUID.test(id) || !UUID.test(orgId) || !identity.workspaces.some(workspace => workspace.id === orgId && workspace.role === "owner")
    || await paymentsAccessFor(orgId, process.env, { actorId: identity.user.id }) === "closed") notFound();
  return <TopUpReturn orderId={id} orgId={orgId} checkout={checkout} />;
}
