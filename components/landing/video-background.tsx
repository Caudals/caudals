"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import MuxVideo from "@mux/mux-video/react";
import type MuxVideoElement from "@mux/mux-video";
import { cn } from "@/lib/utils";

interface LandingVideoBackgroundProps {
  className?: string;
  contentHeight?: number;
}

const HERO_PLAYBACK_ID = "RhkbCujj1LUQdgvChPjq4BhttSiZFeHBoNQyCmAipMk";
const HERO_POSTER_URL =
  `https://image.mux.com/${HERO_PLAYBACK_ID}/thumbnail.webp?time=2`;

export function LandingVideoBackground({
  className,
  contentHeight,
}: LandingVideoBackgroundProps) {
  const videoRef = useRef<MuxVideoElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;

    const muxVideo = videoRef.current;
    let observer: MutationObserver | null = null;

    const applyMediaStyles = () => {
      muxVideo.setAttribute("aria-hidden", "true");
      muxVideo.setAttribute("tabindex", "-1");
      muxVideo.style.display = "block";
      muxVideo.style.width = "100%";
      muxVideo.style.height = "100%";
      muxVideo.style.objectFit = "cover";
      muxVideo.style.objectPosition = "center center";

      const innerVideo = muxVideo.shadowRoot?.querySelector("video");
      if (!(innerVideo instanceof HTMLVideoElement)) {
        return false;
      }

      innerVideo.style.position = "absolute";
      innerVideo.style.inset = "0";
      innerVideo.style.width = "100%";
      innerVideo.style.height = "100%";
      innerVideo.style.display = "block";
      innerVideo.style.objectFit = "cover";
      innerVideo.style.objectPosition = "center center";
      innerVideo.style.backgroundColor = "transparent";
      return true;
    };

    const markReady = () => {
      applyMediaStyles();
      setIsVideoReady(true);
    };

    applyMediaStyles();

    observer = new MutationObserver(() => {
      if (applyMediaStyles()) {
        observer?.disconnect();
        observer = null;
      }
    });

    if (muxVideo.shadowRoot) {
      observer.observe(muxVideo.shadowRoot, { childList: true, subtree: true });
    }

    if (muxVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady();
    }

    muxVideo.addEventListener("loadeddata", markReady);
    muxVideo.addEventListener("canplay", markReady);
    muxVideo.addEventListener("playing", markReady);

    return () => {
      muxVideo.removeEventListener("loadeddata", markReady);
      muxVideo.removeEventListener("canplay", markReady);
      muxVideo.removeEventListener("playing", markReady);
      observer?.disconnect();
    };
  }, []);

  const videoStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden bg-[#f7f7f3]",
        className
      )}
      style={{ height: contentHeight || "100vh" }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center saturate-[0.92] transition-opacity duration-700 ease-out",
          isVideoReady ? "opacity-0" : "opacity-95"
        )}
        style={{ backgroundImage: `url(${HERO_POSTER_URL})` }}
      />

      <div
        className={cn(
          "absolute inset-0 h-full w-full scale-[1.04] overflow-hidden transition-opacity duration-700 ease-out",
          isVideoReady ? "opacity-90" : "opacity-0"
        )}
      >
        <MuxVideo
          ref={videoRef}
          playbackId={HERO_PLAYBACK_ID}
          streamType="on-demand"
          autoplay="muted"
          loop
          muted
          playsInline
          disableTracking
          disablePictureInPicture
          disableRemotePlayback
          preferPlayback="mse"
          preload="auto"
          className="block h-full w-full"
          style={videoStyle}
        />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,247,243,0.94)_0%,rgba(247,247,243,0.7)_24%,rgba(247,247,243,0.2)_58%,rgba(247,247,243,0.46)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(136,190,224,0.24),transparent_36%),radial-gradient(circle_at_50%_72%,rgba(255,255,255,0.92),transparent_38%),linear-gradient(180deg,rgba(247,247,243,0.82)_0%,rgba(247,247,243,0.3)_24%,rgba(247,247,243,0.08)_52%,rgba(247,247,243,0.32)_72%,rgba(247,247,243,0.98)_100%)]" />

      <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,#f7f7f3_0%,rgba(247,247,243,0.78)_54%,rgba(247,247,243,0)_100%)]" />
      <div className="absolute inset-x-0 bottom-28 h-56 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.08)_58%,rgba(255,255,255,0)_78%)] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,rgba(247,247,243,0)_0%,rgba(247,247,243,0.24)_38%,rgba(247,247,243,0.72)_72%,rgba(247,247,243,0.96)_100%)] blur-2xl" />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42rem]"
        style={{
          background:
            "linear-gradient(180deg, rgba(247,247,243,0) 0%, rgba(247,247,243,0.03) 10%, rgba(247,247,243,0.1) 20%, rgba(247,247,243,0.24) 34%, rgba(247,247,243,0.46) 50%, rgba(247,247,243,0.72) 68%, rgba(247,247,243,0.92) 86%, rgba(247,247,243,1) 100%)",
        }}
      />
    </div>
  );
}
