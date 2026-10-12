/**
 * Pure queue arithmetic for the demo: which waiting run goes next, and the
 * time ranges the page shows. Shared by the server and the demo page.
 */

export type Slots = { active: number; website: number; maxActive: number; maxWebsite: number };

/** The next run to admit, from waiting runs in queue order, or null. Pure, for tests. */
export function nextAdmissible<T extends { target_kind: string }>(waiting: T[], slots: Slots): T | null {
  if (slots.active >= slots.maxActive) return null;
  return waiting.find((run) => run.target_kind !== "website" || slots.website < slots.maxWebsite) ?? null;
}

/** Typical durations of a finished run, in seconds. */
export type Durations = { p50: number; p90: number; samples: number };
export const DEFAULT_DURATIONS: Durations = { p50: 240, p90: 480, samples: 0 };

/**
 * When a waiting run's report should be ready, in seconds from now: it starts
 * after the runs ahead of it go through `slots` at a time, then runs itself.
 * Low end: every run takes the median. High end: every run takes the 90th
 * percentile and the runs in progress have only just begun.
 */
export function queueEta(position: number, slots: number, durations: Pick<Durations, "p50" | "p90">) {
  const rounds = Math.ceil(Math.max(1, position) / Math.max(1, slots));
  return { min: rounds * durations.p50, max: (rounds + 1) * durations.p90 };
}

/** Time left for a run in progress, in seconds, from how long it has been running. */
export function runEta(elapsedSeconds: number, durations: Pick<Durations, "p50" | "p90">) {
  return { min: Math.max(20, durations.p50 - elapsedSeconds), max: Math.max(60, durations.p90 - elapsedSeconds) };
}
