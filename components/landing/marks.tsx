import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/** The verdict mark beside a checked answer: an outlined tick or a solid cross. */
export function VerdictMark({ ok, className }: { ok: boolean; className?: string }) {
  return ok ? (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9.25" fill="none" stroke="var(--ink)" strokeWidth="1.25" />
      <path
        d="M6 10.4l2.6 2.6 5.6-5.6"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--ink)" />
      <path
        d="M6.9 6.9l6.2 6.2M13.1 6.9l-6.2 6.2"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Splits "text *highlighted* text" into its plain and highlighted parts. */
export function splitMarked(sentence: string) {
  const match = /^(.*?)\*(.+?)\*(.*)$/.exec(sentence);
  return match
    ? { before: match[1], marked: match[2], after: match[3] }
    : { before: sentence, marked: "", after: "" };
}

/** True while the element is on screen; `once` keeps it true after the first sighting. */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, threshold = 0.2 }: { once?: boolean; threshold?: number } = {},
) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, once, threshold]);

  return inView;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Mirrors `prefers-reduced-motion`, so auto-advancing content can hold still. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Calls `onDone` after `ms` of running time for the current `step`. Holding
 * pauses the clock rather than restarting it, so a visitor who points at the
 * chat and moves away gets the rest of the time, not a fresh interval.
 */
export function useAutoAdvance(step: unknown, ms: number, running: boolean, onDone: () => void) {
  const elapsed = useRef(0);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    elapsed.current = 0;
  }, [step]);

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const timer = window.setTimeout(
      () => {
        elapsed.current = 0;
        done.current();
      },
      Math.max(0, ms - elapsed.current),
    );
    return () => {
      window.clearTimeout(timer);
      elapsed.current += performance.now() - started;
    };
  }, [step, ms, running]);
}
