"use client";

import { useEffect, useState, useRef } from "react";
import { GodRays } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

interface LandingGodRaysBackgroundProps {
  className?: string;
  contentHeight?: number;
}

export function LandingGodRaysBackground({
  className,
  contentHeight,
}: LandingGodRaysBackgroundProps) {
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    canvasSize: 0,
  });
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateDimensions = () => {
      // Check if mobile/tablet
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = contentHeight || window.innerHeight;

        // Calculate diagonal distance and multiply by 1.5 to ensure full coverage
        const diagonal = Math.sqrt(viewportWidth ** 2 + viewportHeight ** 2);
        const canvasSize = diagonal * 1.5;

        setDimensions({
          width: viewportWidth,
          height: viewportHeight,
          canvasSize,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, [contentHeight]);

  // Mobile fallback: CSS gradient only
  if (isMobile) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden",
          className
        )}
        style={{ height: contentHeight || "100%" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 120% 80% at 100% 0%, rgba(243, 243, 243, 0.95) 0%, rgba(255, 255, 255, 0.4) 40%, rgba(255, 255, 255, 0) 70%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/80 to-transparent" />
      </div>
    );
  }

  // Desktop: Full shader with anchor-based positioning
  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden",
        className
      )}
      style={{ height: contentHeight || "100%" }}
    >
      {dimensions.canvasSize > 0 && (
        <>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: `${dimensions.canvasSize}px`,
              height: `${dimensions.canvasSize}px`,
              transform: "translate(50%, -50%)",
              transformOrigin: "center center",
            }}
          >
            <GodRays
              colorBack="#00000000"
              colors={["#FFFFFF6E", "#F3F3F3F0", "#8A8A8A", "#989898"]}
              colorBloom="#FFFFFF"
              offsetX={0}
              offsetY={0}
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
                width: "100%",
                height: "100%",
                position: "absolute",
                top: 0,
                left: 0,
              }}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/80 to-transparent" />
        </>
      )}
    </div>
  );
}
