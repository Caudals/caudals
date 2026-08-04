import { HomePageClient } from "@/components/landing/home-page-client";
import { CAUDALS_AUTHORS } from "@/lib/authors";
import {
  buildMarketingUrl,
  buildPublicMetadata,
  DEFAULT_SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/seo";

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
        "datasets para inteligencia artificial",
        "obtención y licencia de datos",
        "calidad y procedencia de datos",
        "anonimización y preparación de datos",
        "datos para entrenamiento y evaluación de modelos",
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
      name: "Datasets profesionales para IA a medida",
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
      name: "Obtención y preparación de datasets para inteligencia artificial",
      serviceType: "Datasets a medida para entrenamiento, fine-tuning y evaluación de IA",
      description: DEFAULT_SITE_DESCRIPTION,
      provider: {
        "@id": `${buildMarketingUrl("/")}#organization`,
      },
      areaServed: "Worldwide",
      url: buildMarketingUrl("/"),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homePageStructuredData),
        }}
      />
    </>
  );
}
