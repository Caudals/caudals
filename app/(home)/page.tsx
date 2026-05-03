import { HomePageClient } from "@/components/landing/home-page-client";
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
      publisher: {
        "@id": `${buildMarketingUrl("/")}#organization`,
      },
    },
    {
      "@type": "WebPage",
      "@id": `${buildMarketingUrl("/")}#webpage`,
      url: buildMarketingUrl("/"),
      name: SITE_NAME,
      description: DEFAULT_SITE_DESCRIPTION,
      isPartOf: {
        "@id": `${buildMarketingUrl("/")}#website`,
      },
      about: {
        "@id": `${buildMarketingUrl("/")}#organization`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homePageStructuredData),
        }}
      />
    </>
  );
}
