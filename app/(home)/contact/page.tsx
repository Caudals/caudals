import { ContactPageContent } from "@/components/contact/contact-page-content";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPrefixedId(value: string | undefined, prefix: string) {
  if (!value) {
    return undefined;
  }

  return new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{10,}$`).test(value)
    ? value
    : undefined;
}

export const metadata = buildPublicMetadata({
  title: "Contacto para datasets de IA",
  description:
    "Cuéntanos qué dataset necesita tu equipo de IA o qué datos quiere monetizar tu empresa. Revisaremos viabilidad, derechos, calidad, alcance y plazos.",
  pathname: "/contact",
});

const contactStructuredData = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": `${buildMarketingUrl("/contact")}#page`,
  url: buildMarketingUrl("/contact"),
  name: "Contacto para datasets de IA",
  description:
    "Canal de contacto para solicitar datasets a medida o proponer datos empresariales para su monetización.",
  mainEntity: {
    "@type": "Organization",
    "@id": `${buildMarketingUrl("/")}#organization`,
    name: "Caudals",
    email: "hello@caudals.com",
    url: buildMarketingUrl("/"),
  },
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = (await searchParams) ?? {};

  return (
    <>
      <ContactPageContent
        catalogueListingId={readPrefixedId(firstSearchParam(params.dataset), "cl")}
        requestedDatasetId={readPrefixedId(firstSearchParam(params.brief), "ds")}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactStructuredData) }}
      />
    </>
  );
}
