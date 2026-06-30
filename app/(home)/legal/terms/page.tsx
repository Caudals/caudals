import { LegalPage } from "@/components/legal/legal-page";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Terms of Service",
  description: "Terms governing access and use of the Caudals platform.",
  pathname: "/legal/terms",
});

const sections = [
  {
    title: "Platform Use",
    body: "You agree to use Caudals only for lawful data operations and to avoid abusive, fraudulent, or harmful activity.",
  },
  {
    title: "Account Responsibilities",
    body: "You are responsible for maintaining account security, accurate profile information, and authorized use of your workspace.",
  },
  {
    title: "Buyer and Supplier Conduct",
    body: "Buyers must provide clear project requirements and lawful use cases. Suppliers must provide lawful, permissioned, and policy-compliant data access.",
  },
  {
    title: "Intellectual Property",
    body: "Caudals retains all rights to the platform and its content. Datasets and deliverables are licensed under the terms agreed in each order or contract.",
  },
  {
    title: "Payments and Payouts",
    body: "Funding and payouts are processed through integrated payment providers. Processing timelines, reversals, and disputes follow provider and platform rules.",
  },
  {
    title: "Liability and Governing Law",
    body: "The platform is provided on an as-is basis to the extent permitted by law. These terms are governed by the laws of Spain, and disputes are subject to the competent courts of Spain.",
  },
  {
    title: "Termination",
    body: "We may suspend or terminate accounts that violate these terms or create legal, security, or operational risk.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Effective date: March 1, 2026. These terms govern use of Caudals products and services."
      sections={sections}
    />
  );
}
