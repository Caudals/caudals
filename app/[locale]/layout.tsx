import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { locales, type Locale } from "@/lib/i18n/config";
import { PublicRoot } from "@/components/document/public-root";
import { rootMetadata } from "@/components/document/root-metadata";
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
// Only Geist is preloaded: it sets the largest paint on every public page (the
// hero standfirst and headline). Newsreader (the hero's italic word, the
// problem statement, step numbers; 279 KB with its optical-size axis, kept by
// founder decision) and Geist Mono (figure labels) load when the page first
// lays text out in them and swap in as before, instead of competing with the
// stylesheet and the page's script before the first paint (launch L-24b).
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

/**
 * Public marketing layout, one subtree per locale.
 *
 * This is a root layout: it renders `<html lang>` from the URL segment, so each
 * served page declares its own language in the HTML itself. The internal route
 * groups (`(app)`, `(auth)`, `(evaluation)`) have their own English root
 * layouts.
 *
 * Both locales are pre-rendered: `generateStaticParams` lets Next build
 * `/en/...` and `/es/...` at build time, so a visitor is served static HTML in
 * their language rather than a dynamically translated tree.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * The prerendered pages regenerate in the background at most every five
 * minutes, so server-read runtime flags (`DEMO_PUBLIC`, launch L-04) reach
 * them after the app restarts with new credentials, without a rebuild. Pages
 * that read the request (`/call`, the legal notice) and `/demo`, whose robots
 * tag must never lag the flag, stay dynamic.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);

  return {
    ...rootMetadata,
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

  return (
    <PublicRoot locale={locale} fontClassName={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      {children}
    </PublicRoot>
  );
}
