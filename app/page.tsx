"use client";

import { useRef, useEffect, useState } from "react";
import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/landing/hero";
import { WaitlistSection } from "@/components/landing/waitlist";
import { FeaturesSection } from "@/components/landing/features";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { UseCasesSection } from "@/components/landing/use-cases";
import { StatsSection } from "@/components/landing/stats";
import { CTASection } from "@/components/landing/cta";
import { LandingGodRaysBackground } from "@/components/landing/god-rays-background";
import { MarketingFooter } from "@/components/marketing/footer";

export default function Home() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  useEffect(() => {
    const updateContentHeight = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.offsetHeight);
      }
    };

    updateContentHeight();
    window.addEventListener("resize", updateContentHeight);

    // Also update after initial render to ensure correct measurements
    const timeout = setTimeout(updateContentHeight, 100);

    return () => {
      window.removeEventListener("resize", updateContentHeight);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="relative" ref={contentRef}>
        <LandingGodRaysBackground contentHeight={contentHeight} />

        <Header translucent />

        <main className="relative z-10 flex flex-col">
          <HeroSection />
          <WaitlistSection />

          <div id="features">
            <FeaturesSection />
          </div>

          <div id="how-it-works">
            <HowItWorksSection />
          </div>

          <StatsSection />

          <div id="use-cases">
            <UseCasesSection />
          </div>

          <CTASection />
        </main>
      </div>

      <MarketingFooter />
    </div>
  );
}
