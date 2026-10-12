import * as Sentry from "@sentry/nextjs";

type Tags = Record<string, string | number | boolean | null | undefined>;

/**
 * Reports an unexpected server or worker failure to Sentry, when it is
 * configured. Tags carry codes and identifiers only (request id, route, job);
 * the event itself passes the personal-data scrubber (sentry-scrub.mjs).
 * Never throws: observability must not change the caller's error handling.
 */
export function captureServerError(error: unknown, tags: Tags = {}) {
  try {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(tags)) {
      if (value !== undefined && value !== null) clean[key] = String(value).slice(0, 200);
    }
    return Sentry.captureException(error, { tags: clean });
  } catch {
    return undefined;
  }
}

/** Waits up to `timeoutMs` for queued events to be sent (before a process exits). */
export async function flushErrors(timeoutMs = 2000) {
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
