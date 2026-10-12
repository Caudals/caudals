import * as Sentry from "@sentry/nextjs";

import { getSentryServerOptions } from "./sentry-server-config";

/**
 * Starts Sentry in an evaluation worker process (worker, scheduler, browser,
 * documents). The DSN comes from the mounted secret (`SENTRY_DSN_FILE`); the
 * release is the deployed image commit (`SENTRY_RELEASE`). Without a DSN this
 * is a no-op, and a broken configuration never stops the worker.
 */
export function initWorkerSentry(service: string) {
  try {
    const options = getSentryServerOptions(process.env, service);
    if (!options.enabled) return false;
    Sentry.init(options);
    return true;
  } catch {
    console.error(JSON.stringify({ event: "sentry_unavailable", service }));
    return false;
  }
}
