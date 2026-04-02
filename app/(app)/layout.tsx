import type { Metadata } from "next";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata(
  "Caudals app",
  "Authenticated workspace for requester, contributor, admin, and PWA surfaces."
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
