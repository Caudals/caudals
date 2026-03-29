"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import MuxVideo from "@mux/mux-video/react";
import type MuxVideoElement from "@mux/mux-video";
import { cn } from "@/lib/utils";

interface LandingVideoBackgroundProps {
  className?: string;
  contentHeight?: number;
}

const HERO_PLAYBACK_ID = "RhkbCujj1LUQdgvChPjq4BhttSiZFeHBoNQyCmAipMk";
const HERO_MEDIA_POSITION = "center 34%";
const HERO_POSTER_URL =
  `https://image.mux.com/${HERO_PLAYBACK_ID}/thumbnail.webp`;

function subscribeToClientRender() {
  return () => {};
}

export function LandingVideoBackground({
  className,
  contentHeight,
}: LandingVideoBackgroundProps) {
  const videoRef = useRef<MuxVideoElement>(null);
  const hasMounted = useSyncExternalStore(
    subscribeToClientRender,
    () => true,
    () => false
  );
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    if (!hasMounted || !videoRef.current) return;

    const muxVideo = videoRef.current;
    let observer: MutationObserver | null = null;

    const applyMediaStyles = () => {
      muxVideo.setAttribute("aria-hidden", "true");
      muxVideo.setAttribute("tabindex", "-1");
      muxVideo.style.display = "block";
      muxVideo.style.width = "100%";
      muxVideo.style.height = "100%";
      muxVideo.style.objectFit = "cover";
      muxVideo.style.objectPosition = HERO_MEDIA_POSITION;

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
      innerVideo.style.objectPosition = HERO_MEDIA_POSITION;
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
  }, [hasMounted]);

  const videoStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: HERO_MEDIA_POSITION,
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden bg-[#ebf6ff]",
        className
      )}
      style={{ height: contentHeight || "100vh" }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center saturate-[0.98] transition-opacity duration-700 ease-out",
          isVideoReady ? "opacity-0" : "opacity-100"
        )}
        style={{
          backgroundImage: `url(${HERO_POSTER_URL})`,
          backgroundPosition: HERO_MEDIA_POSITION,
        }}
      />

      <div
        className={cn(
          "absolute inset-0 h-full w-full overflow-hidden transition-opacity duration-700 ease-out",
          hasMounted && isVideoReady ? "opacity-100" : "opacity-0"
        )}
      >
        {hasMounted ? (
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
            style={{
              ...videoStyle,
              filter: "saturate(1.08) contrast(1.02) brightness(1)",
            }}
          />
        ) : null}
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(255,255,255,0.52)_22%,rgba(255,255,255,0.32)_48%,rgba(255,255,255,0.22)_72%,rgba(255,255,255,0.26)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(235,246,255,0.26)_0%,rgba(235,246,255,0.15)_24%,rgba(235,246,255,0.05)_54%,rgba(235,246,255,0.16)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0.32)_34%,rgba(255,255,255,0)_64%),radial-gradient(circle_at_top_right,rgba(120,184,224,0.12),transparent_34%),radial-gradient(circle_at_50%_68%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(180deg,rgba(235,246,255,0.15)_0%,rgba(235,246,255,0.05)_22%,rgba(235,246,255,0)_50%,rgba(235,246,255,0.05)_72%,rgba(255,255,255,0.5)_100%)]" />

      <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,#f6fbff_0%,rgba(246,251,255,0.52)_44%,rgba(246,251,255,0)_100%)]" />
      <div className="absolute inset-x-0 bottom-32 h-64 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.1)_52%,rgba(255,255,255,0)_76%)] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_32%,rgba(255,255,255,0.32)_62%,rgba(255,255,255,0.72)_100%)] blur-2xl" />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[64rem]"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.01) 10%, rgba(255,255,255,0.03) 20%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.4) 60%, rgba(255,255,255,0.6) 70%, rgba(255,255,255,0.8) 85%, #ffffff 100%)",
        }}
      />
    </div>
  );
}
