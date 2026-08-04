import Link from "next/link";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Controles básicos de seguridad",
  description:
    "Controles de Caudals para prevenir abusos, proteger subidas de archivos, aislar accesos y procesar webhooks de forma segura e idempotente.",
  pathname: "/docs/security-baseline",
});

export default function SecurityBaselineDocsPage() {
  return (
    <MarketingPageLayout
      title="Security baseline overview"
      description="Snapshot of baseline controls currently enforced in the platform."
      ctaLabel="Read full baseline note"
      ctaHref="/contact"
    >
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-6 text-sm text-slate-500">
          <p>
            Public APIs use rate limiting and bot-trap controls for basic abuse prevention.
          </p>
          <p>
            Upload endpoints enforce allowed buckets, MIME and size constraints, safe path handling, and role/dataset access checks.
          </p>
          <p>
            Stripe webhooks are replay-safe through persisted event IDs and processing state tracking.
          </p>
          <p>
            Production responses include stronger security headers and a CSP strategy with explicit allowlists.
          </p>
          <p>
            For enterprise security reviews and compliance documentation, contact{" "}
            <Link href="mailto:hello@caudals.com" className="text-foreground underline-offset-4 hover:underline">
              hello@caudals.com
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
