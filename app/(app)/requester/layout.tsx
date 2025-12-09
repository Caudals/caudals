import { ReactNode } from "react";
import { requireRequester } from "@/lib/auth/route-guard";

export default async function RequesterLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRequester();
  return <>{children}</>;
}
