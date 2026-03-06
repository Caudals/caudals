import type { Metadata } from "next";
import { MarketingPageLayout } from "@/components/marketing/marketing-page-layout";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How Caudals uses cookies and similar technologies.",
};

const sections = [
  {
    title: "Essential Cookies",
    body: "Required to run authentication, session management, language preferences, and core platform security behavior.",
  },
  {
    title: "Performance Cookies",
    body: "Used to understand product performance and reliability trends so we can improve speed and UX quality.",
  },
  {
    title: "Analytics Technologies",
    body: "We may use privacy-conscious analytics tooling to measure product usage patterns and conversion flow effectiveness.",
  },
  {
    title: "Managing Cookies",
    body: "You can control cookie settings from your browser. Disabling some cookies may impact core platform functionality.",
  },
];

export default function CookiesPolicyPage() {
  return (
    <MarketingPageLayout
      title="Cookie Policy"
      description="Effective date: March 1, 2026. This policy describes how we use cookies and similar technologies."
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
