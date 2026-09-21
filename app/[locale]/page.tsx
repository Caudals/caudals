import type { Metadata } from "next";
import { HomePageClient } from "@/components/landing/home-page-client";
import { CAUDALS_AUTHORS } from "@/lib/authors";
import { locales, localeHtmlLang, type Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { getTranslator, resolveLocale } from "@/lib/i18n/server";
import {
  EVALUATION_OFFERS,
  type EvaluationOffer,
} from "@/lib/public/evaluation-offers";
import {
  buildMarketingUrl,
  buildPublicMetadata,
  getSiteDescription,
  SITE_NAME,
} from "@/lib/seo";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type HomePageProps = { params: Promise<{ locale: string }> };

// Quoted offers publish no price; only the free Initial Diagnostic carries one.
function offerPriceSpecification(offer: EvaluationOffer) {
  return offer.pricing === "free"
    ? { "@type": "PriceSpecification", price: 0, priceCurrency: "EUR" }
    : undefined;
}

/**
 * Structured data, built per locale so each language publishes its own
 * Organization, WebSite, WebPage and Service description at its own URL.
 * Google can then show the right language in rich results for each market.
 */
function buildHomeStructuredData(locale: Locale) {
  const t = getTranslator(locale);
  const description = getSiteDescription(locale);
  const homeUrl = buildMarketingUrl(localizePathname("/", locale));
  const rootUrl = buildMarketingUrl("/");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        // The organization is one entity across both languages, so it keeps a
        // single locale-free @id that every localized page points at.
        "@id": `${rootUrl}#organization`,
        name: SITE_NAME,
        url: rootUrl,
        description,
        email: "hello@caudals.com",
        sameAs: [
          "https://www.linkedin.com/company/caudals/",
          "https://github.com/Caudals",
          "https://x.com/caudalshq",
        ],
        address: {
          "@type": "PostalAddress",
          addressLocality: "Valladolid",
          addressCountry: "ES",
        },
        areaServed: "Worldwide",
        founder: CAUDALS_AUTHORS.map((author) => ({
          "@type": "Person",
          name: author.name,
          sameAs: author.linkedInUrl,
        })),
        knowsAbout: [
          t("structuredData.knowsAbout.topic1"),
          t("structuredData.knowsAbout.topic2"),
          t("structuredData.knowsAbout.topic3"),
          t("structuredData.knowsAbout.topic4"),
          t("structuredData.knowsAbout.topic5"),
        ],
        logo: {
          "@type": "ImageObject",
          url: buildMarketingUrl("/apple-touch-icon.png"),
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "sales",
            email: "hello@caudals.com",
            url: buildMarketingUrl(localizePathname("/contact", locale)),
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${homeUrl}#website`,
        url: homeUrl,
        name: SITE_NAME,
        description,
        inLanguage: localeHtmlLang[locale],
        publisher: { "@id": `${rootUrl}#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${homeUrl}#webpage`,
        url: homeUrl,
        name: t("structuredData.webPageName"),
        description,
        inLanguage: localeHtmlLang[locale],
        isPartOf: { "@id": `${homeUrl}#website` },
        about: { "@id": `${rootUrl}#organization` },
        mainEntity: { "@id": `${homeUrl}#service` },
      },
      {
        "@type": "Service",
        "@id": `${homeUrl}#service`,
        name: t("structuredData.serviceName"),
        serviceType: t("structuredData.serviceType"),
        description,
        provider: { "@id": `${rootUrl}#organization` },
        areaServed: "Worldwide",
        url: homeUrl,
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: t("structuredData.offerCatalog"),
          itemListElement: EVALUATION_OFFERS.map((offer) => ({
            "@type": "Offer",
            name: t(`pricing.offers.${offer.id}.name`),
            description: t(`pricing.offers.${offer.id}.summary`),
            url: `${homeUrl}#pricing`,
            priceSpecification: offerPriceSpecification(offer),
          })),
        },
      },
    ],
  };
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);

  return buildPublicMetadata({
    description: getSiteDescription(locale),
    pathname: "/",
    locale,
  });
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const homePageStructuredData = buildHomeStructuredData(locale);

  return (
    <>
      <HomePageClient />
      <elevenlabs-convai agent-id="agent_3401m2p68kvye268fk176pmg8ech"></elevenlabs-convai>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener("elevenlabs-convai:call",function(e){if(e&&e.detail&&e.detail.config){e.detail.config.workletPaths={rawAudioProcessor:"/elevenlabs/rawAudioProcessor.worklet.js",audioConcatProcessor:"/elevenlabs/audioConcatProcessor.worklet.js"};}});`,
        }}
      />
      <script
        src="https://unpkg.com/@elevenlabs/convai-widget-embed"
        async
        type="text/javascript"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homePageStructuredData),
        }}
      />
    </>
  );
}
