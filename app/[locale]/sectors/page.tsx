import type { Metadata } from "next";
import { SectorsHubClient } from "@/components/sectors/sectors-hub-client";
import { localeHtmlLang, locales, type Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { SECTOR_IDS, SECTORS_HUB_PATH, sectorPath } from "@/lib/public/sectors";
import { getSectorCopy } from "@/lib/sectors/content";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";
import { breadcrumbList, jsonLd, organizationReference } from "@/lib/structured-data";

type SectorsHubProps = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: SectorsHubProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "sectors");

  return buildPublicMetadata({
    title: t("hubMetaTitle"),
    description: t("hubMetaDescription"),
    pathname: SECTORS_HUB_PATH,
    locale,
  });
}

function buildStructuredData(locale: Locale) {
  const t = getScopedTranslator(locale, "sectors");
  const url = buildMarketingUrl(localizePathname(SECTORS_HUB_PATH, locale));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: t("hubMetaTitle"),
        description: t("hubMetaDescription"),
        inLanguage: localeHtmlLang[locale],
        isPartOf: { "@id": `${buildMarketingUrl(localizePathname("/", locale))}#website` },
        about: organizationReference(),
        mainEntity: { "@id": `${url}#sectors` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#sectors`,
        name: t("hubListLabel"),
        itemListElement: SECTOR_IDS.map((id, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: getSectorCopy(id, locale).name,
          url: buildMarketingUrl(localizePathname(sectorPath(id), locale)),
        })),
      },
      {
        ...breadcrumbList([
          { name: t("home"), url: buildMarketingUrl(localizePathname("/", locale)) },
          { name: t("hub"), url },
        ]),
        "@id": `${url}#breadcrumb`,
      },
    ],
  };
}

export default async function SectorsHubPage({ params }: SectorsHubProps) {
  const locale = resolveLocale((await params).locale);
  const sectors = SECTOR_IDS.map((id) => {
    const copy = getSectorCopy(id, locale);
    return {
      id,
      name: copy.name,
      summary: copy.summary,
      audience: copy.audience,
      href: sectorPath(id),
    };
  });

  return (
    <>
      <SectorsHubClient sectors={sectors} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildStructuredData(locale)) }}
      />
    </>
  );
}
