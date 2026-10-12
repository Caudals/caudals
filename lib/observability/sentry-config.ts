import type { NodeOptions } from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/sentry-scrub.mjs";

type EnvMap = Record<string, string | undefined>;

function numberFromEnv(
  name: string,
  fallback: number,
  env: EnvMap = process.env
) {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSentryDsnSource(env: EnvMap = process.env) {
  if (env.SENTRY_DSN?.trim()) {
    return "env";
  }

  if (env.SENTRY_DSN_FILE?.trim()) {
    return "file";
  }

  return "none";
}

/**
 * Options shared by the web runtimes and the evaluation workers. Every event,
 * transaction and breadcrumb passes the personal-data scrubber
 * (`sentry-scrub.mjs`); `service` tags which process sent it and the release is
 * the deployed commit (`SENTRY_RELEASE`, set by the deploy scripts).
 */
export function getSentryOptions(
  env: EnvMap = process.env,
  dsn = env.SENTRY_DSN?.trim() || undefined,
  service = env.SENTRY_SERVICE?.trim() || "web"
): NodeOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE?.trim() || undefined,
    serverName: service,
    initialScope: { tags: { service } },
    tracesSampleRate: numberFromEnv("SENTRY_TRACES_SAMPLE_RATE", 0, env),
    profilesSampleRate: numberFromEnv("SENTRY_PROFILES_SAMPLE_RATE", 0, env),
    sendDefaultPii: false,
    includeLocalVariables: false,
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
