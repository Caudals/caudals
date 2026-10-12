#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const failOnDisabled = args.has("--fail-on-disabled");
const json = args.has("--json");
const sendTestEvent = args.has("--send-test-event");

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
  release: process.env.SENTRY_RELEASE || null,
  service: process.env.SENTRY_SERVICE || null,
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
      `service=${status.service ?? "unset"}`,
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

/**
 * --send-test-event: sends one synthetic error through the same scrubber the
 * app uses (lib/observability/sentry-scrub.mjs), with fake personal data in
 * it, and reports the event id and Sentry's HTTP status. The printed message
 * is the scrubbed one that leaves this process. The DSN is never printed.
 */
if (sendTestEvent && status.enabled) {
  // Node resolves the CommonJS build here; its full API is on the default export.
  const sentryModule = await import("@sentry/nextjs");
  const Sentry = typeof sentryModule.default?.getClient === "function" ? sentryModule.default : sentryModule;
  const { scrubBreadcrumb, scrubEvent } = await import("../lib/observability/sentry-scrub.mjs");
  const service = status.service ?? "web";
  let sent = null;
  let scrubbedMessage = null;
  Sentry.init({
    dsn,
    environment: status.environment ?? undefined,
    release: status.release ?? undefined,
    serverName: service,
    initialScope: { tags: { service, drill: "sentry-test-event" } },
    sendDefaultPii: false,
    includeLocalVariables: false,
    tracesSampleRate: 0,
    defaultIntegrations: false,
    beforeSend: (event) => {
      const scrubbed = scrubEvent(event);
      scrubbedMessage = scrubbed.exception?.values?.[0]?.value ?? null;
      return scrubbed;
    },
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  Sentry.getClient()?.on("afterSendEvent", (_event, response) => {
    sent = response?.statusCode ?? null;
  });
  Sentry.setUser({ id: "synthetic-user", email: "jane.doe@example.com", ip_address: "203.0.113.7" });
  const eventId = Sentry.captureException(
    new Error(
      `Sentry test event (${service}): contact jane.doe@example.com, +34 600 000 000, token sk_test_0123456789abcdefghij, ip 203.0.113.7, https://app.caudals.com/share?token=0123456789abcdef0123456789abcdef`
    ),
    { extra: { email: "jane.doe@example.com", note: "synthetic drill event" } }
  );
  const flushed = await Sentry.flush(10_000);
  console.log(
    JSON.stringify({ test_event: eventId, flushed, http_status: sent, scrubbed_message: scrubbedMessage })
  );
  if (!flushed || sent !== 200) process.exitCode = 1;
}

