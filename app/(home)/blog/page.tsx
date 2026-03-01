import type { Metadata } from "next";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Blog",
  description: "Product and operations updates from Caudals.",
};

export default function BlogPage() {
  return (
    <MarketingPageLayout
      eyebrow="Company"
      title="Caudals Blog"
      description="We will publish product updates, launch notes, and operations deep-dives here."
    >
      <Card className="border-border/70">
        <CardContent className="p-6 text-sm text-muted-foreground">
          First articles are in preparation. Check back soon for roadmap updates and deployment notes.
        </CardContent>
      </Card>
    </MarketingPageLayout>
  );
}
