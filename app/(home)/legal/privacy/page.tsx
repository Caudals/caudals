import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";
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
    body: "We use data to operate requester/contributor/admin workflows, process payouts and funding, secure the platform, and improve service reliability.",
  },
  {
    title: "Data Sharing",
    body: "We share data only with service providers required to run platform operations (for example infrastructure, email, or payment partners) and under contractual safeguards.",
  },
  {
    title: "Security and Retention",
    body: "We apply baseline controls including rate limiting, upload guardrails, audit logs, and webhook replay protection. Data is retained according to legal, contractual, and operational requirements.",
  },
  {
    title: "Your Rights",
    body: "You can request access, correction, deletion, or export of your personal data by contacting privacy@caudals.com.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <MarketingPageLayout
      title="Privacy Policy"
      description="Effective date: March 1, 2026. This policy explains how Caudals handles personal data across platform operations."
    >
      <Card className="border-border/70">
        <CardContent className="space-y-6 p-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm leading-6 text-slate-500">{section.body}</p>
            </section>
          ))}
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
