/**
 * Where accounts live (`app.caudals.com`). The marketing host's
 * NEXT_PUBLIC_APP_URL points at caudals.com, so it is not used here. Shared by
 * the sign-up emails and the public site's "Sign in" link.
 */
export function appOrigin() {
  const configured = process.env.DEMO_APP_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (configured) return new URL(configured).origin;
  return process.env.NODE_ENV === "production" ? "https://app.caudals.com" : "http://localhost:3000";
}
