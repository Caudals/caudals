import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { CookieConsentBanner } from "@/components/legal/cookie-consent-banner";
import { locales, type Locale } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/context";
import { HtmlLang } from "@/components/i18n/html-lang";
import { buildAlternates } from "@/lib/i18n/metadata";
import { resolveLocale } from "@/lib/i18n/server";
import {
  buildMarketingUrl,
  getSiteDescription,
  getSiteTitle,
  SITE_KEYWORDS,
  SITE_NAME,
} from "@/lib/seo";

// The marketing type system: Geist for text, Newsreader for display and
// Geist Mono for labels. Loaded here so only the public site downloads them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

/**
 * Public marketing layout, one subtree per locale.
 *
 * Both locales are pre-rendered: `generateStaticParams` lets Next build
 * `/en/...` and `/es/...` at build time, so a visitor is served static HTML in
 * their language rather than a dynamically translated tree.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);

  return {
    title: {
      // `getSiteTitle` already ends in the brand. Declaring it as `absolute`
      // stops the parent layout's "%s | Caudals" template from appending it a
      // second time, while `template` still brands the pages below that set
      // their own title.
      absolute: getSiteTitle(locale),
      template: `%s | ${SITE_NAME}`,
    },
    description: getSiteDescription(locale),
    keywords: SITE_KEYWORDS[locale],
    alternates: buildAlternates("/", locale, buildMarketingUrl),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = resolveLocale(rawLocale);

  // `<html lang>` is set by the root layout from the same URL segment.
  return (
    <LocaleProvider locale={locale}>
      <HtmlLang locale={locale} />
      {/* `contents` keeps the wrapper out of layout; it only carries the font variables. */}
      <div className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} contents`}>
        {children}
        <CookieConsentBanner />
      </div>
    </LocaleProvider>
  );
}
