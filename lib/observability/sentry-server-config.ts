import { readFileSync } from "node:fs";

import {
  getSentryDsnSource,
  getSentryOptions,
} from "@/lib/observability/sentry-config";

type EnvMap = Record<string, string | undefined>;

function readSentryDsnFromFile(filePath: string) {
  let fileValue: string;
  try {
    fileValue = readFileSync(filePath, "utf8").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read SENTRY_DSN_FILE: ${message}`);
  }

  if (!fileValue) {
    throw new Error("SENTRY_DSN_FILE did not contain a DSN");
  }

  return fileValue;
}

function getServerSentryDsn(env: EnvMap = process.env) {
  return (
    env.SENTRY_DSN?.trim() ||
    (env.SENTRY_DSN_FILE?.trim()
      ? readSentryDsnFromFile(env.SENTRY_DSN_FILE.trim())
      : undefined)
  );
}

export function getSentryServerOptions(env: EnvMap = process.env) {
  return getSentryOptions(env, getServerSentryDsn(env));
}

export { getSentryDsnSource };
