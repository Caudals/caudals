import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";
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
    title: "Payments and Payouts",
    body: "Funding and payouts are processed through integrated payment providers. Processing timelines, reversals, and disputes follow provider and platform rules.",
  },
  {
    title: "Termination",
    body: "We may suspend or terminate accounts that violate these terms or create legal, security, or operational risk.",
  },
];

export default function TermsPage() {
  return (
    <MarketingPageLayout
      title="Terms of Service"
      description="Effective date: March 1, 2026. These terms govern use of Caudals products and services."
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
