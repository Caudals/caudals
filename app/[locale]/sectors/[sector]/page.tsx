import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectorPageClient } from "@/components/sectors/sector-page-client";
import { localeHtmlLang, locales, type Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import {
  SECTOR_IDS,
  SECTOR_SLUGS,
  SECTORS_HUB_PATH,
  sectorIdFromRouteSlug,
  sectorPath,
  type SectorId,
} from "@/lib/public/sectors";
import { getSectorCopy } from "@/lib/sectors/content";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";
import {
  breadcrumbList,
  faqPage,
  jsonLd,
  organizationReference,
} from "@/lib/structured-data";

type SectorPageProps = { params: Promise<{ locale: string; sector: string }> };

/** Every sector in every locale is prerendered; the route segment is the English slug. */
export function generateStaticParams() {
  return locales.flatMap((locale) =>
    SECTOR_IDS.map((id) => ({ locale, sector: SECTOR_SLUGS[id].en })),
  );
}

export const dynamicParams = false;

async function resolveParams(params: SectorPageProps["params"]) {
  const { locale: rawLocale, sector } = await params;
  const locale = resolveLocale(rawLocale);
  const sectorId = sectorIdFromRouteSlug(sector);
  if (!sectorId) notFound();
  return { locale, sectorId };
}

export async function generateMetadata({ params }: SectorPageProps): Promise<Metadata> {
  const { locale, sectorId } = await resolveParams(params);
  const copy = getSectorCopy(sectorId, locale);

  return buildPublicMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    pathname: sectorPath(sectorId),
    locale,
  });
}

function buildStructuredData(sectorId: SectorId, locale: Locale) {
  const copy = getSectorCopy(sectorId, locale);
  const t = getScopedTranslator(locale, "sectors");
  const url = buildMarketingUrl(localizePathname(sectorPath(sectorId), locale));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: copy.metaTitle,
        description: copy.metaDescription,
        inLanguage: localeHtmlLang[locale],
        isPartOf: { "@id": `${buildMarketingUrl(localizePathname("/", locale))}#website` },
        about: organizationReference(),
        mainEntity: { "@id": `${url}#service` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: copy.metaTitle,
        serviceType: copy.metaTitle,
        description: copy.metaDescription,
        provider: organizationReference(),
        areaServed: "Worldwide",
        audience: { "@type": "BusinessAudience", audienceType: copy.audience },
        url,
      },
      {
        ...breadcrumbList([
          { name: t("home"), url: buildMarketingUrl(localizePathname("/", locale)) },
          { name: t("hub"), url: buildMarketingUrl(localizePathname(SECTORS_HUB_PATH, locale)) },
          { name: copy.name, url },
        ]),
        "@id": `${url}#breadcrumb`,
      },
      faqPage(url, copy.faq),
    ],
  };
}

export default async function SectorPage({ params }: SectorPageProps) {
  const { locale, sectorId } = await resolveParams(params);
  const copy = getSectorCopy(sectorId, locale);
  const related = SECTOR_IDS.filter((id) => id !== sectorId).map((id) => {
    const other = getSectorCopy(id, locale);
    return { id, name: other.name, summary: other.summary, href: sectorPath(id) };
  });

  return (
    <>
      <SectorPageClient sectorId={sectorId} copy={copy} related={related} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildStructuredData(sectorId, locale)) }}
      />
    </>
  );
}
