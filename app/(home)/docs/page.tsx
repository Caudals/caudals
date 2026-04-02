import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Documentation",
  description:
    "Operational guides for launching, reviewing, and scaling datasets on Caudals.",
  pathname: "/docs",
});

const guideCards = [
  {
    title: "Requester Quickstart",
    description: "Create your first dataset brief, define quality criteria, and launch contributor workflows.",
    href: "/auth/sign-up",
  },
  {
    title: "Contributor Workflow",
    description: "Find dataset opportunities, submit work, and track review + payout statuses.",
    href: "/browse",
  },
  {
    title: "Admin Operations",
    description: "Moderation, support triage, activity logs, and payment reconciliation best practices.",
    href: "/auth/sign-in",
  },
  {
    title: "Trust Center",
    description:
      "Security posture, governance model, payout transparency, and support SLA targets.",
    href: "/trust",
  },
  {
    title: "Security Baseline",
    description: "Rate limiting, upload guardrails, webhook replay safety, and security headers overview.",
    href: "/docs/security-baseline",
  },
];

export default function DocsPage() {
  return (
    <MarketingPageLayout
      title="Guides to run reliable data operations"
      description="Explore launch guides, role workflows, and operational playbooks to keep dataset programs predictable from intake to payout."
      ctaLabel="Open Dashboard"
      ctaHref="/requester"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {guideCards.map((guide) => (
          <Card key={guide.title} className="border-border/70">
            <CardHeader>
              <CardTitle className="text-lg">{guide.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-500">{guide.description}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={guide.href}>
                  Open guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketingPageLayout>
  );
}
