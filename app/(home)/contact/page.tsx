import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquareText } from "lucide-react";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach Caudals for sales, support, and partnership inquiries.",
};

export default function ContactPage() {
  return (
    <MarketingPageLayout
      eyebrow="Contact"
      title="Talk to the Caudals team"
      description="Share your dataset goals and we will route your request to sales, support, or partnerships."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              For general questions and onboarding support.
            </p>
            <Link href="mailto:contact@caudals.com" className="font-medium text-foreground underline-offset-4 hover:underline">
              contact@caudals.com
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Partnerships
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              For strategic collaborations, enterprise programs, and co-designed initiatives.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/collaborate">Open partnership form</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </MarketingPageLayout>
  );
}
