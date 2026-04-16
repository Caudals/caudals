"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
});

const HERO_SPLINE_SCENE = "/scene-clean.splinecode";

interface HeroSplineSceneProps {
  className?: string;
}

export function HeroSplineScene({ className }: HeroSplineSceneProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      aria-hidden="true"
      data-testid="hero-spline-scene"
      className={cn(
        "pointer-events-none relative flex h-full min-h-[44rem] w-full items-center justify-center overflow-hidden bg-white sm:min-h-[48rem] lg:min-h-[56rem]",
        className
      )}
    >
      <div
        className={cn(
          "relative h-full min-h-[44rem] w-full transition-opacity duration-700 ease-out sm:min-h-[48rem] lg:min-h-[56rem]",
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
    </div>
  );
}
