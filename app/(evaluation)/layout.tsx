import type { Metadata } from "next";
import "./evaluation.css";
/**
 * Authenticated, per-request surface: it reads the operator session, so it must
 * never be prerendered. This was previously implied by a `headers()` call in
 * the root layout, which forced *every* route dynamic — including the public
 * marketing pages. Declaring it here keeps the internal surfaces dynamic while
 * letting the public tree prerender.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evaluations | Caudals",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function EvaluationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
