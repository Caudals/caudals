import { config as loadEnv } from "dotenv";

import {
  getSentryDsnSource,
  getSentryServerOptions,
} from "@/lib/observability/sentry-server-config";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const failOnDisabled = args.has("--fail-on-disabled");
const json = args.has("--json");

const options = getSentryServerOptions();
const status = {
  enabled: options.enabled === true,
  dsnSource: getSentryDsnSource(),
  environment: options.environment ?? null,
  release: options.release ?? null,
  tracesSampleRate: options.tracesSampleRate ?? 0,
  profilesSampleRate: options.profilesSampleRate ?? 0,
  sendDefaultPii: options.sendDefaultPii === true,
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
