import { ReactNode } from "react";
import { requireRole } from "@/lib/auth/route-guard";

export default async function RequesterLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["requester", "admin"]);
  return <>{children}</>;
}
