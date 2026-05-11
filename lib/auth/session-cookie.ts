const BETTER_AUTH_SESSION_COOKIE_NAMES = new Set([
  "caudals.session_token",
  "caudals-session_token",
  "__Secure-caudals.session_token",
  "__Secure-caudals-session_token",
]);

export function isBetterAuthSessionCookieName(cookieName: string) {
  return BETTER_AUTH_SESSION_COOKIE_NAMES.has(cookieName);
}
