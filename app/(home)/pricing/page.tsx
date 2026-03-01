import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for dataset operations, contributor programs, and enterprise governance.",
};

const plans = [
  {
    name: "Starter",
    price: "$499/mo",
    summary: "For teams running their first production data sprint.",
    features: [
      "Up to 3 active dataset requests",
      "Guided quality criteria templates",
      "Contributor matching and review inbox",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "$1,499/mo",
    summary: "For teams operating continuous annotation and validation programs.",
    features: [
      "Unlimited active datasets",
      "Priority reviewer pods",
      "Automation configuration and export workflows",
      "SLA-backed support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    summary: "For organizations with strict governance, compliance, and scale targets.",
    features: [
      "Dedicated program manager",
      "Custom legal/security controls",
      "Advanced payout and reconciliation workflows",
      "Tailored onboarding for multi-team rollout",
    ],
  },
];

export default function PricingPage() {
  return (
    <MarketingPageLayout
      eyebrow="Pricing"
      title="Plans built for production dataset delivery"
      description="Choose a plan aligned with your current operation stage and upgrade as your contributor workflows and governance requirements grow."
      ctaLabel="Start a project"
      ctaHref="/auth/sign-up"
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className="border-border/70">
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-2xl font-semibold">{plan.price}</p>
              <p className="text-sm text-muted-foreground">{plan.summary}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Need a custom rollout plan?</h2>
            <p className="text-sm text-muted-foreground">
              We can tailor security, support, and payout operations to your org requirements.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/contact">Contact sales</Link>
          </Button>
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
