import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BuyerDeliveryWorkspace } from "@/components/buyer/buyer-delivery-workspace";
import { getCurrentBuyerSession } from "@/lib/buyer/session";
import { getBuyerWorkspaceData } from "@/lib/buyer/workspace";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata(
  "Buyer workspace",
  "Read-only buyer delivery, subscription, integration, billing, scorecard, and manifest review surface.",
);

export default async function BuyerWorkspacePage() {
  const lookup = await getCurrentBuyerSession();

  if (lookup.status === "unauthenticated") {
    redirect("/auth/sign-in?next=/buyer");
  }

  if (lookup.status !== "authorized") {
    notFound();
  }

  const data = await getBuyerWorkspaceData(lookup.session);

  return <BuyerDeliveryWorkspace data={data} />;
}
