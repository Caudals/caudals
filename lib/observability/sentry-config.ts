import type { NodeOptions } from "@sentry/nextjs";

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

export function getSentryOptions(
  env: EnvMap = process.env,
  dsn = env.SENTRY_DSN?.trim() || undefined
): NodeOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: numberFromEnv("SENTRY_TRACES_SAMPLE_RATE", 0, env),
    profilesSampleRate: numberFromEnv("SENTRY_PROFILES_SAMPLE_RATE", 0, env),
    sendDefaultPii: false,
  };
}
