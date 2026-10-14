"use client";

import { useEffect, type ReactNode } from "react";
import type Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./landing.css";
import { MarketingFooter } from "@/components/marketing/footer";
import { Header } from "@/components/ui/header";

/**
 * The frame every Paper page shares: the scoped `.lp` palette, header, footer
 * and the landing's momentum scrolling. The home page and the sector pages
 * render their sections inside it.
 */
export function LandingShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Momentum scrolling is for wheels and trackpads: phones and tablets keep
    // their native touch scrolling, so they skip the library entirely, and
    // reduced motion keeps the browser's own scrolling everywhere.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    let lenis: Lenis | null = null;
    let stopped = false;
    let rafId = 0;
    function raf(time: number) {
      lenis?.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    // Loaded and started once the page is idle, so it is never part of the
    // first paint or its hydration work (launch L-24, total blocking time).
    const start = async () => {
      const { default: Smooth } = await import("lenis");
      if (stopped) return;
      // Lenis smooth momentum scrolling (matching datacurve.ai configuration)
      lenis = new Smooth({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.0,
        anchors: { offset: -72 },
      });
      rafId = requestAnimationFrame(raf);
    };
    const idleSupported = typeof window.requestIdleCallback === "function";
    const begin = () => void start();
    const idle = idleSupported ? window.requestIdleCallback(begin, { timeout: 1500 }) : window.setTimeout(begin, 200);

    return () => {
      stopped = true;
      if (idleSupported) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cancelAnimationFrame(rafId);
      lenis?.destroy();
    };
  }, []);

  return (
    <div className="lp min-h-screen">
      <Header />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
