import type { Metadata } from "next";
import { ContactPageContent } from "@/components/contact/contact-page-content";
import { localizePathname } from "@/lib/i18n/routing";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";
import {
  parseRequestedOffer,
  parseRequestedSector,
} from "@/lib/validators/evaluation-request";

type ContactPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "contact");

  return buildPublicMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    pathname: "/contact",
    locale,
  });
}

export default async function ContactPage({ params, searchParams }: ContactPageProps) {
  const locale = resolveLocale((await params).locale);
  const query = (await searchParams) ?? {};
  const t = getScopedTranslator(locale, "contact");
  const pageUrl = buildMarketingUrl(localizePathname("/contact", locale));

  const contactStructuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${pageUrl}#page`,
    url: pageUrl,
    name: t("metaTitle"),
    description: t("metaDescription"),
    inLanguage: locale,
    mainEntity: { "@id": `${buildMarketingUrl("/")}#organization` },
  };

  return (
    <>
      <ContactPageContent
        requestedOffer={parseRequestedOffer(firstSearchParam(query.offer))}
        requestedSector={parseRequestedSector(firstSearchParam(query.sector))}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactStructuredData) }}
      />
    </>
  );
}
