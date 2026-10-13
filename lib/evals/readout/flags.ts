import "server-only";
import type { ReadoutMode } from "./access";

/**
 * READOUT_MODE_ENABLED (launch L-35), read on the server on every request and
 * passed to client components as a prop. "operators" opens readout mode to
 * operators and platform admins (the first rollout step); "true" also to
 * owners and editors; anything else is off.
 */
export function readoutMode(env: Record<string, string | undefined> = process.env): ReadoutMode {
  const value = env.READOUT_MODE_ENABLED?.trim();
  return value === "true" ? "all" : value === "operators" ? "operators" : "off";
}
