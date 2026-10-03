import type { Metadata } from "next";
import { ReactNode } from "react";
import { RootDocument, rootMetadata } from "@/components/document/root-document";
import { buildNoIndexMetadata } from "@/lib/seo";
/**
 * Authenticated, per-request surface: it reads the operator session, so it must
 * never be prerendered. This was previously implied by a `headers()` call in
 * the root layout, which forced *every* route dynamic — including the public
 * marketing pages. Declaring it here keeps the internal surfaces dynamic while
 * letting the public tree prerender.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...rootMetadata,
  ...buildNoIndexMetadata(
    "Caudals app",
    "Internal API and short-link routes."
  ),
};

export default function AppLayout({ children }: { children: ReactNode }) {
  // One of the app's root layouts: internal surfaces are English-only.
  return (
    <RootDocument lang="en">
      {children}
    </RootDocument>
  );
}
