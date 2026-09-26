import type { ReactNode } from "react";
import { RootDocument, rootMetadata } from "@/components/document/root-document";
import { buildNoIndexMetadata } from "@/lib/seo";

/**
 * Sign-in, password reset and security enrolment.
 *
 * These read the request's session cookies, so they are per-request by nature
 * and must never be prerendered. They also sit outside the `/[locale]` tree:
 * AGENTS.md requires the authenticated surfaces to stay separate from the
 * public marketing pages, and they are English-only.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...rootMetadata,
  ...buildNoIndexMetadata("Caudals", "Authenticated access to Caudals."),
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  // One of the app's root layouts: internal surfaces are English-only.
  return <RootDocument lang="en">{children}</RootDocument>;
}
