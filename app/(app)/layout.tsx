import type { Metadata } from "next";
import { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { buildNoIndexMetadata } from "@/lib/seo";
// The legacy operator console is frozen scope (see AGENTS.md): it is maintained,
// not extended. It still adopts the platform token layer so `/admin` reads as
// the same product as `/workspace` and `/ops` rather than a third design.
import "@/packages/brand/platform.css";

/**
 * Authenticated, per-request surface: it reads the operator session, so it must
 * never be prerendered. This was previously implied by a `headers()` call in
 * the root layout, which forced *every* route dynamic — including the public
 * marketing pages. Declaring it here keeps the internal surfaces dynamic while
 * letting the public tree prerender.
 */
export const dynamic = "force-dynamic";

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
