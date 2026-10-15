import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { RootDocument, rootMetadata } from "@/components/document/root-document";
import { LocaleRoot } from "@/components/evals/locale";
import { EvalsMessages } from "@/components/evals/messages";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";
import { LOCALE_COOKIE, type Locale } from "@/lib/evals/messages/en";
import { evalsClientMessages } from "@/lib/evals/messages/client-messages";
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
  // person (the browser's language until they pick one). The choice is
  // published to the page before any bundle runs. The browser gets the
  // messages of this frame (errors, loading, language menu) in that language
  // only; each page adds its own (launch L-24c).
  const locale: Locale = resolveInterfaceLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    (await headers()).get("accept-language"),
  );
  return (
    <RootDocument lang={locale === "es" ? "es-ES" : "en-US"} head={<script dangerouslySetInnerHTML={{ __html: `window.__CAUDALS_LOCALE=${JSON.stringify(locale)};` }} />}>
      <EvalsMessages locale={locale} messages={evalsClientMessages(locale, ["shell"])} />
      <LocaleRoot locale={locale}>{children}</LocaleRoot>
    </RootDocument>
  );
}
