"use client";

import { useRef, useEffect, useState } from "react";
import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/landing/hero";
import { SocialProofSection } from "@/components/landing/social-proof";
import { PlatformLayersSection } from "@/components/landing/platform-overview";
import { FeaturesSection } from "@/components/landing/features";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { StatsSection } from "@/components/landing/stats";
import { ContactSection } from "@/components/landing/partnerships";
import { PricingSection } from "@/components/landing/pricing";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";
import { LandingVideoBackground } from "@/components/landing/video-background";
import { MarketingFooter } from "@/components/marketing/footer";
import { FunnelVisitTracker } from "@/components/analytics/funnel-visit-tracker";

export default function Home() {
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
