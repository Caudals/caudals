import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { cookies, headers } from "next/headers";
import { PublicRoot } from "@/components/document/public-root";
import { NotFoundView } from "@/components/public/not-found-view";
import type { Locale } from "@/lib/i18n/config";
import { getScopedTranslator } from "@/lib/i18n/server";
import { PATHNAME_HEADER } from "@/lib/i18n/routing";
import { notFoundLocale } from "@/lib/public/not-found-locale";

// The public site's type system, declared as in `app/[locale]/layout.tsx`
// (this page has no layout above it): only Geist is preloaded; Newsreader
// keeps its optical-size axis (founder decision).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
  preload: false,
});

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
 * It reads the request (the path the proxy saw, cookies, Accept-Language), so
 * it is rendered per request, and `DEMO_PUBLIC` is read then too.
 */
export default async function GlobalNotFound() {
  const locale = await requestLocale();
  return (
    <PublicRoot locale={locale} fontClassName={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <NotFoundView />
    </PublicRoot>
  );
}
