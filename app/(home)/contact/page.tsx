import { ContactPageContent } from "@/components/contact/contact-page-content";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";
import { parseRequestedOffer } from "@/lib/validators/evaluation-request";

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata = buildPublicMetadata({
  title: "Solicita una evaluación de tu asistente de IA",
  description:
    "Cuéntanos qué sistema de IA tienes, qué responde y quién es responsable. Te respondemos en 24 horas con el mejor punto de partida: un Reality Check gratuito o una evaluación piloto.",
  pathname: "/contact",
});

const contactStructuredData = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": `${buildMarketingUrl("/contact")}#page`,
  url: buildMarketingUrl("/contact"),
  name: "Solicitar una evaluación de IA",
  description:
    "Canal para solicitar un Reality Check gratuito o una evaluación de un asistente, chatbot o agente de IA.",
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
        requestedOffer={parseRequestedOffer(firstSearchParam(params.offer))}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactStructuredData) }}
      />
    </>
  );
}
