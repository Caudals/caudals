import type { NodeOptions } from "@sentry/nextjs";

function numberFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSentryOptions(): NodeOptions {
  const dsn = process.env.SENTRY_DSN;

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: numberFromEnv("SENTRY_TRACES_SAMPLE_RATE", 0),
    profilesSampleRate: numberFromEnv("SENTRY_PROFILES_SAMPLE_RATE", 0),
    sendDefaultPii: false,
  };
}
