import Link from "next/link";
import { CheckCircle2, Shield, Wallet, Workflow } from "lucide-react";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Trust Center",
  description:
    "Security controls, governance model, payout transparency, and support SLAs for Caudals.",
  pathname: "/trust",
});

const trustPillars = [
  {
    title: "Security Baseline",
    icon: Shield,
    description:
      "Public endpoints are rate-limited, uploads are guarded by strict bucket + MIME validation, and Stripe webhooks are replay-safe.",
    checkpoints: [
      "Abuse protection on waitlist + collaboration APIs",
      "Upload path and access guardrails per role",
      "Replay protection for webhook event processing",
      "Security headers and hardened CSP baseline",
    ],
  },
  {
    title: "Governance Model",
    icon: Workflow,
    description:
      "Role-segmented workspaces and auditable moderation actions keep data operations traceable.",
    checkpoints: [
      "Requester, contributor, and admin isolation",
      "Admin activity log for moderation actions",
      "Approval workflow with explicit status transitions",
      "Support triage and queue ownership workflows",
    ],
  },
  {
    title: "Payout Transparency",
    icon: Wallet,
    description:
      "Funding and payout flows are ledger-backed so finance and ops can reconcile every movement.",
    checkpoints: [
      "Canonical cents-based transaction accounting",
      "Dataset funding lifecycle status tracking",
      "Payout status timeline for contributor earnings",
      "Failed payout reconciliation queue for admins",
    ],
  },
];

const supportSla = [
  { tier: "Critical payment or funding blockers", firstResponse: "≤ 4h", targetResolution: "≤ 1 business day" },
  { tier: "Dataset workflow incidents", firstResponse: "≤ 8h", targetResolution: "≤ 2 business days" },
  { tier: "General platform support", firstResponse: "≤ 1 business day", targetResolution: "≤ 3 business days" },
];

export default function TrustCenterPage() {
  return (
    <MarketingPageLayout
      title="Evaluate Caudals reliability before you launch"
      description="This page summarizes the controls behind platform security, governance, payout integrity, and support responsiveness so your team can self-qualify fit."
      ctaLabel="Open Security Baseline"
      ctaHref="/docs/security-baseline"
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {trustPillars.map((pillar) => (
          <Card
            key={pillar.title}
            className="border-border/70 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_100%)]"
          >
            <CardHeader className="space-y-3">
              <Badge variant="outline" className="w-fit border-border/70 bg-white/70">
                {pillar.title}
              </Badge>
              <CardTitle className="flex items-center gap-2 text-xl">
                <pillar.icon className="h-5 w-5 text-primary" />
                {pillar.title}
              </CardTitle>
              <p className="text-sm text-slate-500">{pillar.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {pillar.checkpoints.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Support SLA Targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supportSla.map((row) => (
            <div
              key={row.tier}
              className="grid gap-2 rounded-xl border border-border/70 px-4 py-3 text-sm md:grid-cols-[2fr_1fr_1fr]"
            >
              <span className="font-medium">{row.tier}</span>
              <span className="text-slate-500">First response: {row.firstResponse}</span>
              <span className="text-slate-500">
                Target resolution: {row.targetResolution}
              </span>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            SLA targets apply to standard business-hours support and are reviewed quarterly.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Due Diligence Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/docs/security-baseline">Security controls</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/legal/privacy">Privacy policy</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/legal/terms">Terms of service</Link>
          </Button>
          <Button asChild>
            <Link href="/contact">Contact support</Link>
          </Button>
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
