import { HomePageClient } from "@/components/landing/home-page-client";
import { CAUDALS_AUTHORS } from "@/lib/authors";
import { createTranslator } from "@/lib/i18n/create-translator";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  EVALUATION_OFFERS,
  type EvaluationOffer,
} from "@/lib/public/evaluation-offers";
import {
  buildMarketingUrl,
  buildPublicMetadata,
  DEFAULT_SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/seo";

// Structured data is published in Spanish, like the rest of the canonical metadata.
const es = createTranslator("es", getDictionary("es"));

// Quoted offers publish no price; only the free Initial Diagnostic carries one.
function offerPriceSpecification(offer: EvaluationOffer) {
  return offer.pricing === "free"
    ? { "@type": "PriceSpecification", price: 0, priceCurrency: "EUR" }
    : undefined;
}

const homePageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${buildMarketingUrl("/")}#organization`,
      name: SITE_NAME,
      url: buildMarketingUrl("/"),
      description: DEFAULT_SITE_DESCRIPTION,
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
        "@id": `${buildMarketingUrl(`/equipo/${author.slug}`)}#person`,
        name: author.name,
        url: buildMarketingUrl(`/equipo/${author.slug}`),
      })),
      knowsAbout: [
        "evaluación de asistentes y agentes de IA",
        "conjuntos de pruebas validados por expertos",
        "análisis de fallos de sistemas de IA",
        "calidad y trazabilidad de respuestas de IA",
        "datos de dominio para IA",
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
          url: buildMarketingUrl("/contact"),
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${buildMarketingUrl("/")}#website`,
      url: buildMarketingUrl("/"),
      name: SITE_NAME,
      description: DEFAULT_SITE_DESCRIPTION,
      inLanguage: ["es", "en"],
      publisher: {
        "@id": `${buildMarketingUrl("/")}#organization`,
      },
    },
    {
      "@type": "WebPage",
      "@id": `${buildMarketingUrl("/")}#webpage`,
      url: buildMarketingUrl("/"),
      name: "Evaluación independiente de asistentes de IA",
      description: DEFAULT_SITE_DESCRIPTION,
      isPartOf: {
        "@id": `${buildMarketingUrl("/")}#website`,
      },
      about: {
        "@id": `${buildMarketingUrl("/")}#organization`,
      },
      mainEntity: {
        "@id": `${buildMarketingUrl("/")}#service`,
      },
    },
    {
      "@type": "Service",
      "@id": `${buildMarketingUrl("/")}#service`,
      name: "Evaluación de asistentes y agentes de IA",
      serviceType:
        "Evaluación independiente de sistemas de IA con conjuntos de pruebas validados por expertos",
      description: DEFAULT_SITE_DESCRIPTION,
      provider: {
        "@id": `${buildMarketingUrl("/")}#organization`,
      },
      areaServed: "Worldwide",
      url: buildMarketingUrl("/"),
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: es("Offers and pricing"),
        itemListElement: EVALUATION_OFFERS.map((offer) => ({
          "@type": "Offer",
          name: es(offer.name),
          description: es(offer.summary),
          url: buildMarketingUrl("/#pricing"),
          priceSpecification: offerPriceSpecification(offer),
        })),
      },
    },
  ],
};

export const metadata = buildPublicMetadata({
  description: DEFAULT_SITE_DESCRIPTION,
  pathname: "/",
});

export default function HomePage() {
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
