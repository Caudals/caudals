import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SupplierPortalWorkspace } from "@/components/supplier/supplier-portal-workspace";
import { isSupplierPortalEnabled } from "@/lib/supplier/feature-flags";
import { getCurrentSupplierSession } from "@/lib/supplier/session";
import { getSupplierWorkspaceData } from "@/lib/supplier/workspace";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata(
  "Supplier portal",
  "Managed supplier onboarding, asset declaration, sample upload, and build participation surface.",
);

export default async function SupplierPortalPage() {
  if (!isSupplierPortalEnabled()) {
    notFound();
  }

  const lookup = await getCurrentSupplierSession();

  if (lookup.status === "unauthenticated") {
    redirect("/auth/sign-in?next=/supplier");
  }

  if (lookup.status !== "authorized") {
    notFound();
  }

  const data = await getSupplierWorkspaceData(lookup.session);

  return <SupplierPortalWorkspace data={data} />;
}
