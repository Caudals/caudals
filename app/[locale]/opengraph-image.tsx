import { locales } from "@/lib/i18n/config";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og/render";
import { getSiteTitle } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Caudals";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Share card for the home page, and the default for pages without their own. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "hero");

  return renderOgImage({
    eyebrow: getSiteTitle(locale).replace(/\s*\|\s*Caudals$/, ""),
    headline: t("headline"),
    footnote: t("primaryCta"),
  });
}
