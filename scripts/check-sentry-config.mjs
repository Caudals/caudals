#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const failOnDisabled = args.has("--fail-on-disabled");
const json = args.has("--json");

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDsnSource() {
  if (process.env.SENTRY_DSN?.trim()) {
    return "env";
  }

  if (process.env.SENTRY_DSN_FILE?.trim()) {
    return "file";
  }

  return "none";
}

function readDsnFromFile(filePath) {
  let fileValue;
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

function getDsn() {
  return (
    process.env.SENTRY_DSN?.trim() ||
    (process.env.SENTRY_DSN_FILE?.trim()
      ? readDsnFromFile(process.env.SENTRY_DSN_FILE.trim())
      : undefined)
  );
}

let dsn;
try {
  dsn = getDsn();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Sentry status check failed: ${message}`);
  process.exit(2);
}

const status = {
  enabled: Boolean(dsn),
  dsnSource: getDsnSource(),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? null,
  release: process.env.SENTRY_RELEASE ?? null,
  tracesSampleRate: numberFromEnv("SENTRY_TRACES_SAMPLE_RATE", 0),
  profilesSampleRate: numberFromEnv("SENTRY_PROFILES_SAMPLE_RATE", 0),
  sendDefaultPii: false,
};

if (json) {
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(
    [
      `sentry enabled=${status.enabled}`,
      `dsn_source=${status.dsnSource}`,
      `environment=${status.environment ?? "unset"}`,
      `release=${status.release ?? "unset"}`,
      `traces_sample_rate=${status.tracesSampleRate}`,
      `profiles_sample_rate=${status.profilesSampleRate}`,
      `send_default_pii=${status.sendDefaultPii}`,
    ].join(" ")
  );
}

if (failOnDisabled && !status.enabled) {
  console.error(
    "Sentry error delivery is disabled. Set SENTRY_DSN or SENTRY_DSN_FILE."
  );
  process.exitCode = 1;
}
