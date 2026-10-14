/**
 * Data controls (launch L-32, spec P-44 and the P-42 follow-up): the answer
 * retention setting, "Export all workspace data" and the countersigned DPA
 * copy. Read on the server at request time (and by the scheduler) and passed
 * to client components as a prop. Off unless `DATA_CONTROLS_ENABLED=true`.
 */
export function dataControlsEnabled(env: Record<string, string | undefined> = process.env) {
  return env.DATA_CONTROLS_ENABLED === "true";
}

/** Retention periods an owner can choose for observations (answers); unset keeps them. */
export const OBSERVATION_RETENTION_DAYS = [30, 90, 365] as const;
export type ObservationRetentionDays = (typeof OBSERVATION_RETENTION_DAYS)[number];

export function isRetentionDays(value: unknown): value is ObservationRetentionDays {
  return typeof value === "number" && (OBSERVATION_RETENTION_DAYS as readonly number[]).includes(value);
}

/** How long a finished workspace export can be downloaded before its file is deleted. */
export const WORKSPACE_EXPORT_LINK_DAYS = 7;
