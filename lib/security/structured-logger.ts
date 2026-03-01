type LogLevel = "info" | "warn" | "error";

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "session",
  "signature",
  "access_key",
  "refresh_key",
  "webhook",
  "ssn",
  "iban",
  "routing",
  "account_number",
  "card",
] as const;

function isSensitiveKey(key?: string) {
  if (!key) {
    return false;
  }
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}

function looksSensitiveValue(value: string) {
  const lowered = value.toLowerCase();
  return (
    lowered.includes("sk_test_") ||
    lowered.includes("sk_live_") ||
    lowered.includes("pk_test_") ||
    lowered.includes("pk_live_") ||
    lowered.includes("whsec_") ||
    lowered.includes("sb_publishable_") ||
    lowered.includes("bearer ")
  );
}

function maskEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 1) {
    return REDACTED;
  }
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

function sanitize(value: unknown, key?: string, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[Truncated]";
  }

  if (isSensitiveKey(key)) {
    return REDACTED;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (looksSensitiveValue(value)) {
      return REDACTED;
    }
    if (value.includes("@") && !key?.toLowerCase().includes("event")) {
      return maskEmail(value);
    }
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack:
        process.env.NODE_ENV === "production"
          ? "[hidden]"
          : value.stack ?? "[missing]",
    };
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [nestedKey, nestedValue]) => {
      acc[nestedKey] = sanitize(nestedValue, nestedKey, depth + 1);
      return acc;
    }, {});
  }

  return String(value);
}

function writeLog(level: LogLevel, event: string, context?: unknown) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    context: sanitize(context),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.info(payload);
}

export function logInfo(event: string, context?: unknown) {
  writeLog("info", event, context);
}

export function logWarn(event: string, context?: unknown) {
  writeLog("warn", event, context);
}

export function logError(event: string, context?: unknown) {
  writeLog("error", event, context);
}
