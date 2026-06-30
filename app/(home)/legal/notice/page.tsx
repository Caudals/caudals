import { LegalPage } from "@/components/legal/legal-page";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Legal Notice",
  description:
    "Legal notice and ownership information for the Caudals website under Spanish LSSI-CE.",
  pathname: "/legal/notice",
});

const sections = [
  {
    title: "Site Owner",
    body: "This website is operated by Caudals ([legal company name]), tax ID [NIF/CIF], with registered office at [registered address], registered in the [Commercial Registry] [registry details]. Contact: hello@caudals.com.",
  },
  {
    title: "Purpose",
    body: "Caudals provides a B2B marketplace and managed data operations service that helps companies sell proprietary data and helps AI teams acquire clean, compliant, ML-ready datasets.",
  },
  {
    title: "Terms of Use",
    body: "Access to and use of this website implies acceptance of these terms together with our Terms of Service, Privacy Policy, and Cookie Policy. Users agree to make lawful use of the website and its content.",
  },
  {
    title: "Intellectual Property",
    body: "The contents of this website, including texts, designs, logos, and software, are owned by Caudals or its licensors and are protected by intellectual and industrial property law. Reproduction without authorization is prohibited.",
  },
  {
    title: "Liability",
    body: "Caudals is not liable for damages arising from the misuse of the website or from temporary unavailability due to maintenance or technical causes, to the extent permitted by applicable law.",
  },
  {
    title: "Applicable Law and Jurisdiction",
    body: "This legal notice is governed by Spanish law. Any dispute relating to the website will be subject to the competent courts of Spain.",
  },
];

export default function LegalNoticePage() {
  return (
    <LegalPage
      title="Legal Notice"
      description="Effective date: March 1, 2026. Ownership and legal information for this website under Spanish Law 34/2002 (LSSI-CE)."
      sections={sections}
    />
  );
}
