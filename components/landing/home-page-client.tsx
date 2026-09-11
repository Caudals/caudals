"use client";

import { FunnelVisitTracker } from "@/components/analytics/funnel-visit-tracker";
import { CTASection } from "@/components/landing/cta";
import { FeaturesSection } from "@/components/landing/features";
import { FAQSection } from "@/components/landing/faq";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { ContactSection } from "@/components/landing/partnerships";
import { PricingSection } from "@/components/landing/pricing";
import { SocialProofSection } from "@/components/landing/social-proof";
import { StatsSection } from "@/components/landing/stats";
import { UseCasesSection } from "@/components/landing/use-cases";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";

export function HomePageClient() {
  return (
    <div className="relative min-h-screen bg-white">
      <FunnelVisitTracker />
      <div className="relative isolate">
        <Header translucent />

        <main className="relative z-10 flex flex-col">
          <HeroSection />

          <SocialProofSection />

          <div id="how-it-works" className="bg-white">
            <HowItWorksSection />
          </div>

          <div id="what-we-evaluate" className="bg-white">
            <UseCasesSection />
          </div>

          <div id="features" className="bg-white">
            <FeaturesSection />
          </div>

          <StatsSection />
          <ContactSection />
          <PricingSection />
          <FAQSection />
          <CTASection />
        </main>
      </div>

      <MarketingFooter />
    </div>
  );
}
