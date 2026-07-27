"use client";

import { useSyncExternalStore } from "react";
import {
  detectHeavyVisualsDisabled,
  type DetectHeavyVisualsOptions,
} from "@/lib/heavy-visuals";

/**
 * The environment probe (user agent, `navigator.webdriver`, WebGL renderer)
 * cannot change over the life of the document, so there is nothing to
 * subscribe to and the result is cached after the first read.
 */
const subscribe = () => () => {};

const cache = new Map<boolean, boolean>();

function getSnapshot(respectReducedMotion: boolean): boolean {
  const cached = cache.get(respectReducedMotion);
  if (cached !== undefined) return cached;

  const detected = detectHeavyVisualsDisabled({ respectReducedMotion });
  cache.set(respectReducedMotion, detected);
  return detected;
}

/** On the server, always assume heavy visuals are off so SSR emits the fallback. */
const getServerSnapshot = () => true;

/**
 * Returns whether GPU-heavy decorative visuals should be replaced by a static
 * fallback in the current browser.
 *
 * Uses `useSyncExternalStore` so the value is read during render (no
 * setState-in-effect cascade) while still rendering the fallback for SSR and
 * hydration.
 */
export function useHeavyVisualsDisabled({
  respectReducedMotion = false,
}: DetectHeavyVisualsOptions = {}): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(respectReducedMotion),
    getServerSnapshot
  );
}
