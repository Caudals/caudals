import Link from "next/link";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Careers",
  description: "Careers and hiring information for Caudals.",
  pathname: "/careers",
});

export default function CareersPage() {
  return (
    <MarketingPageLayout
      title="Careers at Caudals"
      description="We are building role-driven infrastructure for reliable dataset operations."
    >
      <Card className="border-border/70">
        <CardContent className="space-y-3 p-6 text-sm text-slate-500">
          <p>Open roles are published periodically as we scale product and operations.</p>
          <p>
            For general hiring interest, email{" "}
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
