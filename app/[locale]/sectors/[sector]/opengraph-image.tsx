import { notFound } from "next/navigation";
import { locales } from "@/lib/i18n/config";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og/render";
import { SECTOR_IDS, SECTOR_SLUGS, sectorIdFromRouteSlug } from "@/lib/public/sectors";
import { getSectorCopy } from "@/lib/sectors/content";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Caudals";

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    SECTOR_IDS.map((id) => ({ locale, sector: SECTOR_SLUGS[id].en })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; sector: string }>;
}) {
  const { locale: rawLocale, sector } = await params;
  const locale = resolveLocale(rawLocale);
  const sectorId = sectorIdFromRouteSlug(sector);
  if (!sectorId) notFound();
  const copy = getSectorCopy(sectorId, locale);
  const tHero = getScopedTranslator(locale, "hero");

  return renderOgImage({
    eyebrow: copy.name,
    headline: copy.headline,
    footnote: tHero("primaryCta"),
  });
}
