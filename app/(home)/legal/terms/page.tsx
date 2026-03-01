import type { Metadata } from "next";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access and use of the Caudals platform.",
};

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
    title: "Requester and Contributor Conduct",
    body: "Requesters must provide clear project requirements and fair compensation terms. Contributors must submit lawful, original, and policy-compliant work.",
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
      eyebrow="Legal"
      title="Terms of Service"
      description="Effective date: March 1, 2026. These terms govern use of Caudals products and services."
    >
      <Card className="border-border/70">
        <CardContent className="space-y-6 p-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
