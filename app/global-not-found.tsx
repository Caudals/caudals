import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { cookies, headers } from "next/headers";
import { PublicRoot } from "@/components/document/public-root";
import { LinkOriginProvider } from "@/components/i18n/locale-link";
import { NotFoundView } from "@/components/public/not-found-view";
import type { Locale } from "@/lib/i18n/config";
import { getScopedTranslator } from "@/lib/i18n/server";
import { PATHNAME_HEADER } from "@/lib/i18n/routing";
import { notFoundLocale } from "@/lib/public/not-found-locale";
import { getAppSiteOrigin, getMarketingSiteOrigin } from "@/lib/seo";

// The public site's type system, as in `app/[locale]/layout.tsx` (this page
// has no layout above it); Newsreader keeps its optical-size axis (founder
// decision). Nothing is preloaded: Next puts this module at the root of every
// route, so a preload here became a `Link` header on every app page and put
// Geist on sign-up's LCP path (L-24c). The 404 swaps its fonts in when it
// first lays text out.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap", preload: false });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
  preload: false,
});

/**
 * On the app host the public links point at the public site: translated slugs
 * (`/es/contacto`) are rewritten only there (proxy.ts).
 */
async function linkOrigin(): Promise<string> {
  const host = (await headers()).get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const app = new URL(getAppSiteOrigin()).hostname;
  const marketing = getMarketingSiteOrigin();
  return host && host === app && new URL(marketing).hostname !== app ? marketing : "";
}

async function requestLocale(): Promise<Locale> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return notFoundLocale({
    pathname: headerStore.get(PATHNAME_HEADER),
    cookie: (name) => cookieStore.get(name)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getScopedTranslator(await requestLocale(), "notFound");
  // Next adds `noindex` to every 404 response itself.
  return { title: `${t("metaTitle")} | Caudals` };
}

/**
 * The 404 for every URL that matches no page, on both hosts: `/en/nada`,
 * `/es/sectores/nada`, `app.caudals.com/workspace/nada` (launch L-24c). Next
 * renders it on the server with status 404, so the localized page and its
 * free-test link (L-30) are in the HTML without JavaScript. Pages that call
 * `notFound()` themselves still use `app/[locale]/not-found.tsx`.
 *
 * It reads the request (the path the proxy saw, cookies, Accept-Language, the
 * host), so it is rendered per request, and `DEMO_PUBLIC` is read then too.
 * On the app host its links lead to the public site.
 */
export default async function GlobalNotFound() {
  const [locale, origin] = await Promise.all([requestLocale(), linkOrigin()]);
  return (
    <PublicRoot locale={locale} fontClassName={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <LinkOriginProvider origin={origin}>
        <NotFoundView />
      </LinkOriginProvider>
    </PublicRoot>
  );
}
