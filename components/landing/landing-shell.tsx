"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./landing.css";
import { FunnelVisitTracker } from "@/components/analytics/funnel-visit-tracker";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";

/**
 * The frame every Paper page shares: the scoped `.lp` palette, header, footer
 * and the landing's momentum scrolling. The home page and the sector pages
 * render their sections inside it.
 */
export function LandingShell({ children }: { children: ReactNode }) {
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
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
