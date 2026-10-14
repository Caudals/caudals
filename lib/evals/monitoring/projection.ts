/**
 * The monthly projection shown with a schedule's estimate (launch L-18, spec
 * v2 §6.7: "schedules (per run plus a monthly projection)"). Pure, so the
 * schedule dialog and the server share it.
 */
export type Cadence = "daily" | "weekly" | "monthly";

/** Runs a schedule makes in one month: monthly one (none in a short month when it is set to the 29th–31st), weekly 4–5, daily 28–31. */
export function runsPerMonth(cadence: Cadence): { min: number; max: number } {
  if (cadence === "monthly") return { min: 1, max: 1 };
  if (cadence === "weekly") return { min: 4, max: 5 };
  return { min: 28, max: 31 };
}

/** p50 × the fewest runs to p90 × the most, in whole credits rounded up. */
export function monthlyProjection(cadence: Cadence, perRun: { p50: number; p90: number }) {
  const runs = runsPerMonth(cadence);
  return { runs, low: Math.ceil(perRun.p50 * runs.min), high: Math.ceil(perRun.p90 * runs.max) };
}
