"use client";

import { GodRays } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

interface LandingGodRaysBackgroundProps {
  variant?: "full-page" | "hero";
  className?: string;
}

export function LandingGodRaysBackground({
  variant = "full-page",
  className,
}: LandingGodRaysBackgroundProps) {
  const sharedShaderProps = {
    colorBack: "#00000000",
    colors: ["#FFFFFF6E", "#F3F3F3F0", "#8A8A8A", "#989898"],
    colorBloom: "#FFFFFF",
    offsetX: 0.85,
    offsetY: -1,
    intensity: 1,
    spotty: 0.45,
    midSize: 10,
    midIntensity: 0,
    density: 0.12,
    bloom: 0.15,
    speed: 1,
    scale: 1.6,
    frame: 3332042.8159981333,
    style: {
      height: "100%",
      width: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    },
  };

  if (variant === "hero") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
          className
        )}
      >
        <div className="sticky top-0 h-screen">
          <div className="relative h-full w-full">
            <GodRays
              {...sharedShaderProps}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/80 to-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden",
        className
      )}
    >
      <GodRays
        {...sharedShaderProps}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white via-white/80 to-transparent" />
    </div>
  );
}
