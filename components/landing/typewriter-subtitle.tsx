"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TypewriterSubtitleProps {
  /** The full text to type out. */
  text: string;
  /** Initial delay before typing begins in ms. Defaults to 250ms. */
  startDelay?: number;
  /** Milliseconds per character. Defaults to 40ms for a calm, polished pace. */
  charMs?: number;
  /** Optional container class name. */
  className?: string;
  /** Caret color class. Defaults to brand teal. */
  caretClassName?: string;
}

export function TypewriterSubtitle({
  text,
  startDelay = 300,
  charMs = 46,
  className,
  caretClassName = "text-teal-700/80",
}: TypewriterSubtitleProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let rafId: number;
    let startTime = 0;

    const animate = (timestamp: number) => {
      if (startTime === 0) {
        startTime = timestamp + startDelay;
        setVisibleCount(0);
      }

      if (timestamp >= startTime) {
        const nextCount = Math.min(
          text.length,
          Math.floor((timestamp - startTime) / charMs) + 1,
        );
        setVisibleCount(nextCount);
        if (nextCount >= text.length) return;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [text, startDelay, charMs]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={cn("inline", className)}>
        {text.slice(0, visibleCount)}
        <span
          className={cn(
            "caret-blink inline-block w-0 overflow-visible font-normal select-none",
            caretClassName,
          )}
        >
          |
        </span>
        <span className="text-transparent select-none">
          {text.slice(visibleCount)}
        </span>
      </span>
    </>
  );
}
