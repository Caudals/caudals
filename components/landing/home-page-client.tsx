"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
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
  useEffect(() => {
    // Respect user's reduced motion preference
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Lenis smooth momentum scrolling (matching datacurve.ai configuration)
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.0,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
  return (
    <div className="relative min-h-screen bg-background">
      <FunnelVisitTracker />
      <div className="relative isolate">
        <Header translucent />

        <main className="relative z-10 flex flex-col">
          <HeroSection />

          <SocialProofSection />

          <div id="how-it-works" className="bg-background">
            <HowItWorksSection />
          </div>

          <div id="what-we-evaluate" className="bg-background">
            <UseCasesSection />
          </div>

          <div id="features" className="bg-background">
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
