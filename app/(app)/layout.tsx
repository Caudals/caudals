import type { Metadata } from "next";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { buildNoIndexMetadata } from "@/lib/seo";
// The legacy operator console is frozen scope (see AGENTS.md): it is maintained,
// not extended. It still adopts the platform token layer so `/admin` reads as
// the same product as `/workspace` and `/ops` rather than a third design.
import "@/packages/brand/platform.css";

export const metadata: Metadata = buildNoIndexMetadata(
  "Caudals app",
  "Authenticated workspace for internal and migration-only app surfaces."
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="p-root" data-surface="admin">
      <AppShell>{children}</AppShell>
    </div>
  );
}
