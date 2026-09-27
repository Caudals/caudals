import type { Metadata } from "next";
import { cookies } from "next/headers";
import { RootDocument, rootMetadata } from "@/components/document/root-document";
import { LocaleRoot } from "@/components/evals/locale";
import { LOCALE_COOKIE, type Locale } from "@/lib/evals/messages/en";
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
  ...rootMetadata,
  title: "Caudals",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function EvaluationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The app is available in American English and Castilian Spanish, chosen per
  // person. The choice is published to the page before any bundle runs.
  const locale: Locale = (await cookies()).get(LOCALE_COOKIE)?.value === "es" ? "es" : "en";
  return (
    <RootDocument lang={locale === "es" ? "es-ES" : "en-US"} head={<script dangerouslySetInnerHTML={{ __html: `window.__CAUDALS_LOCALE=${JSON.stringify(locale)};` }} />}>
      <LocaleRoot locale={locale}>{children}</LocaleRoot>
    </RootDocument>
  );
}
