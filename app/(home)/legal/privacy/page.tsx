import { LegalPage } from "@/components/legal/legal-page";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Privacy Policy",
  description: "How Caudals collects, uses, and protects personal data.",
  pathname: "/legal/privacy",
});

const sections = [
  {
    title: "Data We Collect",
    body: "We collect account details, profile information, dataset workflow activity, support communication, and payment operation metadata needed to provide the platform.",
  },
  {
    title: "How We Use Data",
    body: "We use data to operate buyer, supplier, and internal admin workflows, support commercial operations, secure the platform, and improve service reliability.",
  },
  {
    title: "Legal Basis",
    body: "We process personal data to perform our contract with you, to pursue our legitimate interest in operating and securing the platform, to comply with legal obligations, and on the basis of your consent where required.",
  },
  {
    title: "Data Sharing and International Transfers",
    body: "We share data only with service providers required to run platform operations (for example infrastructure, email, or payment partners) under contractual safeguards. Where data leaves the European Economic Area, we rely on adequacy decisions or standard contractual clauses.",
  },
  {
    title: "Security and Retention",
    body: "We apply baseline controls including rate limiting, upload guardrails, audit logs, and webhook replay protection. Data is retained according to legal, contractual, and operational requirements.",
  },
  {
    title: "Your Rights",
    body: "You can request access, rectification, erasure, portability, restriction, or object to processing of your personal data, and withdraw consent at any time, by contacting privacy@caudals.com. You may also lodge a complaint with your data protection authority.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="Effective date: March 1, 2026. This policy explains how Caudals handles personal data across platform operations."
      sections={sections}
    />
  );
}
