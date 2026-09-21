import type { ReactNode } from "react";
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

export const metadata = buildNoIndexMetadata(
  "Caudals",
  "Authenticated access to Caudals.",
);

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
