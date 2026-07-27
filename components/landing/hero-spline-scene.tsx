"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useHeavyVisualsDisabled } from "@/lib/hooks/use-heavy-visuals-disabled";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
});

const HERO_SPLINE_SCENE = "/scene-clean.splinecode";

const SCENE_SIZING =
  "h-full min-h-[44rem] w-full sm:min-h-[48rem] lg:min-h-[56rem]";

interface HeroSplineSceneProps {
  className?: string;
}

export function HeroSplineScene({ className }: HeroSplineSceneProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  // SSR and hydration render the fallback; the WebGL runtime only mounts once
  // the browser is known to be able to afford it.
  const useStaticFallback = useHeavyVisualsDisabled();

  return (
    <div
      aria-hidden="true"
      data-testid="hero-spline-scene"
      data-static-fallback={useStaticFallback ? "true" : "false"}
      className={cn(
        "pointer-events-none relative flex items-center justify-center overflow-hidden bg-white",
        SCENE_SIZING,
        className
      )}
    >
      {useStaticFallback ? (
        <HeroSceneStaticFallback />
      ) : (
        <div
          className={cn(
            "relative transition-opacity duration-700 ease-out",
            SCENE_SIZING,
            isLoaded ? "opacity-100" : "opacity-0"
          )}
        >
          <Spline
            scene={HERO_SPLINE_SCENE}
            onLoad={() => setIsLoaded(true)}
            className="h-full w-full"
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Paint-only stand-in for the WebGL hero scene. Mirrors the scene's teal/blue
 * bloom so the hero keeps its depth without a render loop.
 */
function HeroSceneStaticFallback() {
  return (
    <div className={cn("absolute inset-0", SCENE_SIZING)}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 140% 80% at 60% -10%, rgba(167, 189, 245, 0.45) 0%, rgba(122, 200, 181, 0.2) 45%, rgba(247, 247, 243, 0.1) 70%, rgba(247, 247, 243, 0) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-72"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.85) 70%, rgba(255,255,255,1) 100%)",
        }}
      />
    </div>
  );
}
