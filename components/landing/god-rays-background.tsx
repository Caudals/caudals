"use client";

import { useEffect, useState } from "react";
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
  const fallbackHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    canvasSize: 0,
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateDimensions = () => {
      // Check if mobile/tablet
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        const viewportWidth = window.innerWidth;
        const targetHeight = contentHeight || window.innerHeight;

        // Calculate diagonal distance and multiply to ensure full coverage
        const diagonal = Math.sqrt(viewportWidth ** 2 + targetHeight ** 2);
        const canvasSize = diagonal * 1.2;

        setDimensions({
          width: viewportWidth,
          height: targetHeight,
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
        style={{ height: contentHeight || fallbackHeight }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 140% 80% at 60% -10%, rgba(167, 189, 245, 0.45) 0%, rgba(122, 200, 181, 0.2) 45%, rgba(247, 247, 243, 0.1) 70%, rgba(247, 247, 243, 0))",
          }}
        />
        {/* Bottom gradient for smooth transition */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-72"
          style={{
            background:
              "linear-gradient(180deg, rgba(247,247,243,0) 0%, rgba(247,247,243,0.4) 30%, rgba(247,247,243,0.85) 70%, rgba(247,247,243,1) 100%)",
          }}
        />
      </div>
    );
  }

  // Desktop: Full shader with anchor-based positioning
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden",
        className
      )}
      style={{
        height: dimensions.height || contentHeight || fallbackHeight || "100%",
      }}
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
              colorBack="#f7f7f3"
              colors={["#eef4ff", "#a7bdf5", "#7ac8b5", "#f7f7f3"]}
              colorBloom="#fefefe"
              offsetX={0}
              offsetY={0}
              intensity={0.8}
              spotty={0.4}
              midSize={12}
              midIntensity={0.12}
              density={0.06}
              bloom={0.15}
              speed={0.8}
              scale={1.4}
              frame={2332042.8159981333}
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                top: 0,
                left: 0,
              }}
            />
          </div>
          {/* Top gradient for smooth blend with header */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{
              background:
                "linear-gradient(0deg, rgba(247,247,243,0) 0%, rgba(247,247,243,0.55) 70%, #f7f7f3 100%)",
            }}
          />
          {/* Bottom gradient for smooth transition to next section */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1000"
            style={{
              background:
                "linear-gradient(180deg, #f7f7f300 0%, rgba(247,247,243,0.3) 25%, rgba(247,247,243,0.75) 60%, rgba(247,247,243,0.95) 70%, rgba(247,247,243,1) 100%)",
            }}
          />
        </>
      )}
    </div>
  );
}
