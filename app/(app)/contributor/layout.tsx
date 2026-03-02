import { ReactNode } from "react";
import { requireRole } from "@/lib/auth/route-guard";

export default async function ContributorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["contributor", "admin"]);
  return <>{children}</>;
}
