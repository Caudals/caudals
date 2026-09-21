"use client";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "./config";

/**
 * Records an explicit language choice.
 *
 * The cookie is read only by the proxy, and only when a visitor arrives at a
 * URL that carries no locale of its own. It never overrides the locale in the
 * URL, so a shared `/es/blog` link always renders Spanish regardless of what
 * the recipient chose previously.
 */
export function rememberLocale(locale: Locale) {
  if (typeof document === "undefined") return;

  const parts = [
    `${LOCALE_COOKIE}=${locale}`,
    "path=/",
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
    "samesite=lax",
  ];

  if (window.location.protocol === "https:") {
    parts.push("secure");
  }

  document.cookie = parts.join("; ");
}
