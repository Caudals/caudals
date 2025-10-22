"use client";

import { GodRays } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

interface LandingGodRaysBackgroundProps {
  className?: string;
}

export function LandingGodRaysBackground({
  className,
}: LandingGodRaysBackgroundProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 bottom-0 -z-10 overflow-hidden",
        className
      )}
    >
      <div className="relative h-full w-full">
        <GodRays
          colorBack="#00000000"
          colors={["#FFFFFF6E", "#F3F3F3F0", "#8A8A8A", "#989898"]}
          colorBloom="#FFFFFF"
          offsetX={0.58}
          offsetY={-1.48}
          intensity={1}
          spotty={0.45}
          midSize={10}
          midIntensity={0}
          density={0.12}
          bloom={0.15}
          speed={1}
          scale={1.6}
          frame={3332042.8159981333}
          style={{
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/80 to-transparent" />
      </div>
    </div>
  );
}
