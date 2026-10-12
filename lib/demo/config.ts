/**
 * Runtime switches and limits of the public demo, read on the server on every
 * use so a changed value applies after the app restarts with new credentials.
 * Flags default to off (docs/ARCHITECTURE.md, Public demo).
 */

export function intEnv(name: string, fallback: number, min = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

export function numberEnv(name: string, fallback: number, min = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

const flag = (name: string) => process.env[name]?.trim() === "true";

/** A FIFO queue instead of the `busy` and `capacity` refusals. */
export const queueEnabled = () => flag("DEMO_QUEUE_ENABLED");
/** The commercial fallback model, under the daily euro cap. */
export const fallbackEnabled = () => flag("DEMO_FALLBACK_ENABLED");
/** Skips the primary (DGX) model: for DGX maintenance and the production fallback check. */
export const fallbackForced = () => fallbackEnabled() && flag("DEMO_FALLBACK_FORCE");

/** Runs that may be in progress at once (reading, writing, asking or grading). */
export const maxActive = () => intEnv("DEMO_MAX_ACTIVE", 3, 1);
/** Website runs at once: the browser worker's demo concurrency (EVALS_BROWSER_DEMO_CONCURRENCY). */
export const maxActiveWebsite = () => Math.min(maxActive(), intEnv("DEMO_MAX_ACTIVE_WEBSITE", 2, 1));
/** Runs that may wait; beyond it a new test is refused as `queue_full`. */
export const queueMax = () => intEnv("DEMO_QUEUE_MAX", 50, 1);
/** A run that waits longer than this fails as `queue_timeout`. */
export const queueMaxWaitMs = () => intEnv("DEMO_QUEUE_MAX_WAIT_MINUTES", 360, 5) * 60_000;

/**
 * Per-phase time limits. A phase that runs over fails the run with
 * `timeout_<phase>`. Website phases include waiting for the browser worker.
 */
export const PHASE_LIMIT_MS = {
  reading: 5 * 60_000,
  writing: 10 * 60_000,
  asking: 12 * 60_000,
  grading: 5 * 60_000,
} as const;

/** How long the browser worker may look for the chat once it has the run. */
export const CHAT_DETECTION_MS = 150_000;
/** A started run older than this is failed by the sweeper as `interrupted`. */
export const RUN_LIMIT_MS = 25 * 60_000;
