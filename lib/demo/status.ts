import "server-only";
import { fallbackEnabled, fallbackForced, maxActive, queueEnabled } from "./config";
import { fallbackAvailable, primaryAvailable } from "./limits";
import type { ServiceLevel } from "./view";

/**
 * What the demo page tells visitors about the service, refreshed at most every
 * five seconds so polling pages cost the database nothing extra.
 */
let cached: { at: number; value: ServiceLevel } | null = null;

export async function serviceLevel(): Promise<ServiceLevel> {
  // Without the queue and the fallback the page keeps its earlier behaviour.
  if (!queueEnabled() && !fallbackEnabled()) return "ok";
  if (cached && Date.now() - cached.at < 5_000) return cached.value;
  const [primary, fallback] = await Promise.all([primaryAvailable().catch(() => false), fallbackAvailable().catch(() => false)]);
  const value: ServiceLevel = !primary && !fallback ? "capacity" : !primary && !fallbackForced() ? "degraded" : "ok";
  cached = { at: Date.now(), value };
  return value;
}

/** Slots runs go through at once, for the page's ETA arithmetic. */
export const slots = () => maxActive();
