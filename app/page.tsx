"use client";

import { useRef, useEffect, useState } from "react";
import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/landing/hero";
import { SocialProofSection } from "@/components/landing/social-proof";
import { PlatformLayersSection } from "@/components/landing/platform-overview";
import { FeaturesSection } from "@/components/landing/features";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { StatsSection } from "@/components/landing/stats";
import { PartnershipsSection } from "@/components/landing/partnerships";
import { ResourceStrip } from "@/components/landing/resource-strip";
import { PricingSection } from "@/components/landing/pricing";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";
import { LandingGodRaysBackground } from "@/components/landing/god-rays-background";
import { MarketingFooter } from "@/components/marketing/footer";

export default function Home() {
  const heroStackRef = useRef<HTMLDivElement>(null);
  const [heroHeight, setHeroHeight] = useState(0);

  useEffect(() => {
    const updateHeroHeight = () => {
      if (heroStackRef.current) {
        setHeroHeight(heroStackRef.current.offsetHeight);
      }
    };

    updateHeroHeight();
    window.addEventListener("resize", updateHeroHeight);

    const observer = new ResizeObserver(updateHeroHeight);
    if (heroStackRef.current) {
      observer.observe(heroStackRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateHeroHeight);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="relative">
        <LandingGodRaysBackground contentHeight={heroHeight} />

        <Header translucent />

        <main className="relative z-10 flex flex-col">
          <div ref={heroStackRef}>
            <HeroSection />
            <SocialProofSection />
            <PlatformLayersSection />

            <div id="features">
              <FeaturesSection />
            </div>

            <div id="how-it-works">
              <HowItWorksSection />
            </div>
          </div>

          <StatsSection />
          <PartnershipsSection />
          <ResourceStrip />
          <PricingSection />
          <FAQSection />
          <CTASection />
        </main>
      </div>

      <MarketingFooter />
    </div>
  );
}
