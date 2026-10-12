import { locales } from "@/lib/i18n/config";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og/render";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Caudals";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Share card for the free test (launch L-04). */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "demo");

  return renderOgImage({
    eyebrow: t("metaTitle"),
    headline: t("headline"),
    footnote: t("ogNote"),
  });
}
