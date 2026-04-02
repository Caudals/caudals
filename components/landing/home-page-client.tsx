"use client";

import { useEffect, useRef, useState } from "react";
import { FunnelVisitTracker } from "@/components/analytics/funnel-visit-tracker";
import { CTASection } from "@/components/landing/cta";
import { FeaturesSection } from "@/components/landing/features";
import { FAQSection } from "@/components/landing/faq";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { ContactSection } from "@/components/landing/partnerships";
import { PlatformLayersSection } from "@/components/landing/platform-overview";
import { PricingSection } from "@/components/landing/pricing";
import { SocialProofSection } from "@/components/landing/social-proof";
import { StatsSection } from "@/components/landing/stats";
import { LandingVideoBackground } from "@/components/landing/video-background";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";

export function HomePageClient() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroHeight, setHeroHeight] = useState(0);

  useEffect(() => {
    const updateHeroHeight = () => {
      if (heroRef.current) {
        setHeroHeight(heroRef.current.offsetHeight);
      }
    };

    updateHeroHeight();
    window.addEventListener("resize", updateHeroHeight);

    const observer = new ResizeObserver(updateHeroHeight);
    if (heroRef.current) {
      observer.observe(heroRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateHeroHeight);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-white">
      <FunnelVisitTracker />
      <div className="relative isolate">
        <LandingVideoBackground contentHeight={heroHeight + 400} />

        <Header translucent />

        <main className="relative z-10 flex flex-col">
          <div ref={heroRef}>
            <HeroSection />
          </div>

          <SocialProofSection />
          <PlatformLayersSection />

          <div id="features" className="bg-white">
            <FeaturesSection />
          </div>

          <div id="how-it-works" className="bg-white">
            <HowItWorksSection />
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
