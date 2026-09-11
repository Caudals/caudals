#!/usr/bin/env node

import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const failOnMissing = args.has("--fail-on-missing");
const json = args.has("--json");

function readSecret(name) {
  const directValue = process.env[name]?.trim();
  if (directValue) {
    return { present: true, source: "env", value: directValue };
  }

  const fileEnvName = `${name}_FILE`;
  const filePath = process.env[fileEnvName]?.trim();
  if (!filePath) {
    return { present: false, source: "none" };
  }

  try {
    const fileValue = readFileSync(filePath, "utf8").trim();
    if (!fileValue) {
      return { present: false, source: "file", error: `${fileEnvName} empty` };
    }

    return { present: true, source: "file", value: fileValue };
  } catch {
    return { present: false, source: "file", error: `${fileEnvName} unreadable` };
  }
}

function readPlain(name) {
  const value = process.env[name]?.trim();
  return {
    present: Boolean(value),
    source: value ? "env" : "none",
    value,
  };
}

function senderAddress(value) {
  if (!value) {
    return "";
  }

  const bracketed = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  return bracketed?.[1] ?? value;
}

function isEmailLike(value) {
  const address = senderAddress(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function sourceFor(result) {
  return result.present ? result.source : "missing";
}

function buildEmailStatus() {
  const apiKey = readSecret("RESEND_API_KEY");
  const fromEmail = readPlain("RESEND_FROM_EMAIL");
  const fallbackFromEmail = readPlain("RESEND_FALLBACK_FROM_EMAIL");
  const generalAudienceId = readPlain("RESEND_GENERAL_AUDIENCE_ID");
  const partnershipsAudienceId = readPlain("RESEND_PARTNERSHIPS_AUDIENCE_ID");
  const contactNotification = readPlain("CONTACT_NOTIFICATION_EMAIL");
  const missing = [];
  const invalidFormat = [];

  if (!apiKey.present) {
    missing.push("RESEND_API_KEY");
  } else if (!apiKey.value.startsWith("re_")) {
    invalidFormat.push("RESEND_API_KEY");
  }

  if (!fromEmail.present) {
    missing.push("RESEND_FROM_EMAIL");
  } else if (!isEmailLike(fromEmail.value)) {
    invalidFormat.push("RESEND_FROM_EMAIL");
  }

  if (!generalAudienceId.present) {
    missing.push("RESEND_GENERAL_AUDIENCE_ID");
  }

  if (fallbackFromEmail.present && !isEmailLike(fallbackFromEmail.value)) {
    invalidFormat.push("RESEND_FALLBACK_FROM_EMAIL");
  }

  if (
    contactNotification.present &&
    !isEmailLike(contactNotification.value)
  ) {
    invalidFormat.push("CONTACT_NOTIFICATION_EMAIL");
  }

  return {
    ready: missing.length === 0 && invalidFormat.length === 0,
    apiKeySource: sourceFor(apiKey),
    fromEmailSource: sourceFor(fromEmail),
    fallbackFromEmailConfigured: fallbackFromEmail.present,
    generalAudienceConfigured: generalAudienceId.present,
    partnershipsAudienceConfigured: partnershipsAudienceId.present,
    contactNotificationConfigured: contactNotification.present,
    missing,
    invalidFormat,
    readErrors: [apiKey.error].filter(Boolean),
  };
}

const status = {
  email: buildEmailStatus(),
};

if (json) {
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(
    [
      `email ready=${status.email.ready}`,
      `api_key_source=${status.email.apiKeySource}`,
      `from_email=${status.email.fromEmailSource}`,
      `general_audience=${status.email.generalAudienceConfigured}`,
      `partnerships_audience=${status.email.partnershipsAudienceConfigured}`,
      `contact_notification=${status.email.contactNotificationConfigured}`,
      `missing=${status.email.missing.join(",") || "none"}`,
      `invalid_format=${status.email.invalidFormat.join(",") || "none"}`,
    ].join(" ")
  );
}

if (failOnMissing && !status.email.ready) {
  for (const readError of status.email.readErrors) {
    console.error(readError);
  }

  process.exitCode = 1;
}
