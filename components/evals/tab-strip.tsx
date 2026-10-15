"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The scrolling row behind `Tabs` and `TabLinks` (launch R4). On a narrow
 * screen a row of tabs scrolls sideways with its scrollbar hidden, so the
 * strip brings the current tab into view when it opens and marks which ends
 * have more tabs (`data-overflow`), which the stylesheet fades.
 */
export function TabStrip({
  as: Element = "div",
  current,
  className = "p-tabs",
  children,
  ...props
}: {
  as?: "div" | "nav";
  /** Changes when the current tab changes, to bring it into view. */
  current: string;
  className?: string;
  children: ReactNode;
  role?: string;
  "aria-label": string;
  "data-variant"?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const mark = () => {
      const end = strip.scrollWidth - strip.clientWidth;
      const before = strip.scrollLeft > 1;
      const after = strip.scrollLeft < end - 1;
      const value = before && after ? "both" : before ? "start" : after ? "end" : "";
      if (value) strip.dataset.overflow = value;
      else delete strip.dataset.overflow;
    };
    mark();
    strip.addEventListener("scroll", mark, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    observer?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", mark);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const strip = ref.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const active = strip.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!active) return;
    const box = strip.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    // Leave a little of the neighbour showing, so the row still reads as scrollable.
    if (tab.left < box.left) strip.scrollLeft += tab.left - box.left - 24;
    else if (tab.right > box.right) strip.scrollLeft += tab.right - box.right + 24;
  }, [current]);

  return (
    <Element ref={ref as never} className={className} {...props}>
      {children}
    </Element>
  );
}
