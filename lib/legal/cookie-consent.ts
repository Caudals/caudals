// Lightweight first-party cookie-consent state shared by the banner and the
// analytics loader. Stored in localStorage (essential, first-party) and
// broadcast via window events so the analytics script reacts to changes.

export type CookieConsent = "accepted" | "rejected";

const STORAGE_KEY = "caudals_cookie_consent";
/** Fired when the visitor accepts/rejects, so analytics can load/stay off. */
export const COOKIE_CONSENT_EVENT = "caudals:cookie-consent";
/** Fired to re-open the banner (e.g. the "Cookie preferences" footer link). */
export const OPEN_COOKIE_PREFERENCES_EVENT = "caudals:open-cookie-preferences";

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(value: CookieConsent) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }),
    );
  } catch {
    // Storage can be unavailable (private mode); fail closed (no analytics).
  }
}

export function openCookiePreferences() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
}
