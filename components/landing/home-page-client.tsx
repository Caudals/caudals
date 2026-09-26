"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./landing.css";
import { FunnelVisitTracker } from "@/components/analytics/funnel-visit-tracker";
import { CTASection } from "@/components/landing/cta";
import { HeroSection } from "@/components/landing/hero";
import { PartnerLogos } from "@/components/landing/partner-logos";
import { ProblemSection } from "@/components/landing/problem";
import { StepsSection } from "@/components/landing/steps";
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
      anchors: { offset: -72 },
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
    <div className="lp min-h-screen">
      <FunnelVisitTracker />
      <Header />
      <main>
        <HeroSection />
        <PartnerLogos />
        <ProblemSection />
        <StepsSection />
        <CTASection />
      </main>
      <MarketingFooter />
    </div>
  );
}
