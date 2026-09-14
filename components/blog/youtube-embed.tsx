"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { blogMediaFrameClassName } from "@/components/blog/media-frame";
import { cn } from "@/lib/utils";

type YouTubeEmbedProps = {
  className?: string;
  startAt?: number;
  title: string;
  videoId: string;
};

export function YouTubeEmbed({
  className,
  startAt = 0,
  title,
  videoId,
}: YouTubeEmbedProps) {
  const [isActive, setIsActive] = useState(false);
  const [posterSrc, setPosterSrc] = useState(
    `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
  );

  const embedSrc = useMemo(() => {
    const params = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      rel: "0",
    });

    if (startAt > 0) {
      params.set("start", String(startAt));
    }

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }, [startAt, videoId]);

  return (
    <div className={cn(`${blogMediaFrameClassName} overflow-hidden bg-background`, className)}>
      <div className="relative aspect-video bg-black">
        {isActive ? (
          <iframe
            className="block h-full w-full"
            src={embedSrc}
            title={title}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            aria-label={title}
            className="group relative block h-full w-full overflow-hidden bg-black text-left"
            onClick={() => setIsActive(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterSrc}
              alt={title}
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => {
                if (posterSrc.includes("/vi_webp/")) {
                  setPosterSrc(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
                }
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-black/5 to-black/10 transition-opacity duration-200 group-hover:opacity-70" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/92 text-black shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-transform duration-200 group-hover:scale-105">
                <Play className="ml-1 h-7 w-7 fill-current" />
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
