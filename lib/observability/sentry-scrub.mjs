// Personal-data scrubbing for every Sentry event, breadcrumb and transaction
// (launch L-08, spec P-48). Plain ESM so the web server, the workers and
// `scripts/check-sentry-config.mjs` inside the runtime image share one copy.
//
// Events keep what is needed to fix a fault: exception type, scrubbed message,
// stack frames, release, environment, service and request method and path.
// They never carry: users, IP addresses, cookies, headers, query strings,
// request bodies, local variables, emails, phone numbers, tokens, connection
// strings or long identifiers that could be bearer secrets.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CONNECTION = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/gi;
const BEARER = /\b(bearer|basic|token|apikey|api-key)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const SECRET_PREFIX = /\b(sk|pk|rk|whsec|re|sk-or-v1|ghp|gho|xox[abpr])[_-][A-Za-z0-9_-]{12,}/g;
const QUERY = /([?&#])[^\s"'<>]*/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const PHONE = /(?<![\w-])\+?\d[\d\s().-]{7,}\d(?![\w-])/g;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const SENSITIVE_KEY = /pass(word)?|secret|token|authori[sz]ation|cookie|session|e-?mail|dsn|api[-_]?key|credential|signature|phone|address|ip_?addr/i;
const KEEP_CONTEXTS = new Set(["runtime", "os", "app", "device", "culture", "cloud_resource", "trace", "otel"]);
const MAX_DEPTH = 6;

/** @param {string} value */
export function scrubString(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(CONNECTION, "[connection]")
    .replace(EMAIL, "[email]")
    .replace(BEARER, "$1 [token]")
    .replace(JWT, "[token]")
    .replace(SECRET_PREFIX, "[token]")
    .replace(QUERY, (match, lead) => (lead === "#" || match.length > 1 ? `${lead}[redacted]` : match))
    .replace(LONG_TOKEN, (match) => (/^[0-9a-f-]{36}$/i.test(match) ? match : "[token]"))
    .replace(IPV4, "[ip]")
    .replace(IPV6, "[ip]")
    .replace(PHONE, (match) => (!DATE.test(match) && match.replace(/\D/g, "").length >= 9 ? "[number]" : match));
}

/** Deep copy with scrubbed strings; sensitive keys are dropped entirely. */
export function scrubValue(value, depth = 0) {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    out[key] = scrubValue(item, depth + 1);
  }
  return out;
}

/** Path only: no query string, no fragment, long path segments masked. */
export function scrubUrl(value) {
  if (typeof value !== "string" || !value) return value;
  let path = value;
  try {
    const url = new URL(value, "http://relative.invalid");
    path = url.origin === "http://relative.invalid" ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    path = value.split(/[?#]/)[0];
  }
  return scrubString(path);
}

function scrubFrames(exception) {
  for (const frame of exception?.stacktrace?.frames ?? []) {
    delete frame.vars;
  }
}

/**
 * Sentry `beforeSend` / `beforeSendTransaction`. Mutates and returns the event.
 * @template T
 * @param {T} event
 * @returns {T}
 */
export function scrubEvent(event) {
  if (!event || typeof event !== "object") return event;
  const e = /** @type {Record<string, any>} */ (event);
  delete e.user;
  if (e.request) {
    e.request = {
      method: e.request.method,
      url: scrubUrl(e.request.url),
    };
  }
  if (typeof e.message === "string") e.message = scrubString(e.message);
  if (e.logentry) {
    e.logentry = { message: scrubString(e.logentry.message ?? ""), params: [] };
  }
  if (typeof e.transaction === "string") e.transaction = scrubUrl(e.transaction);
  for (const exception of e.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = scrubString(exception.value);
    scrubFrames(exception);
  }
  for (const thread of e.threads?.values ?? []) scrubFrames(thread);
  if (e.breadcrumbs) {
    const list = Array.isArray(e.breadcrumbs) ? e.breadcrumbs : e.breadcrumbs.values ?? [];
    e.breadcrumbs = list.map(scrubBreadcrumb).filter(Boolean).slice(-30);
  }
  if (e.extra) e.extra = scrubValue(e.extra);
  if (e.tags) e.tags = scrubValue(e.tags);
  if (e.contexts) {
    const contexts = {};
    for (const [key, context] of Object.entries(e.contexts)) {
      if (KEEP_CONTEXTS.has(key)) contexts[key] = scrubValue(context);
    }
    e.contexts = contexts;
  }
  if (Array.isArray(e.spans)) {
    for (const span of e.spans) {
      if (typeof span.description === "string") span.description = scrubString(span.description);
      if (span.data) span.data = scrubValue(span.data);
    }
  }
  delete e.modules;
  return event;
}

/**
 * Sentry `beforeBreadcrumb`: console output and URLs are scrubbed, request
 * and response bodies are never kept.
 * @template T
 * @param {T} breadcrumb
 * @returns {T | null}
 */
export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== "object") return breadcrumb;
  const b = /** @type {Record<string, any>} */ (breadcrumb);
  if (typeof b.message === "string") b.message = scrubString(b.message);
  if (b.data) {
    const data = {};
    for (const [key, value] of Object.entries(b.data)) {
      if (key === "arguments" || SENSITIVE_KEY.test(key)) continue;
      data[key] = key === "url" || key === "to" || key === "from" ? scrubUrl(value) : scrubValue(value, 1);
    }
    b.data = data;
  }
  return breadcrumb;
}
