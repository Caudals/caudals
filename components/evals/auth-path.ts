import { safeRedirectPath } from "@/lib/evals/domain/routing";
const invitationRoute = "/workspace/invitations";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function invitationTokenFromFragment(fragment: string) {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const token = params.get("token") ?? "";
  return Array.from(params.keys()).length === 1 && tokenPattern.test(token)
    ? token
    : "";
}
export function invitationPath(token: string) {
  return tokenPattern.test(token)
    ? `${invitationRoute}#token=${token}`
    : invitationRoute;
}
export function evaluationReturnPath(value: string | null | undefined) {
  const path = safeRedirectPath(value ?? null);
  const pathname = new URL(path, "https://app.caudals.com").pathname;
  if (pathname === invitationRoute) {
    // Shared routing intentionally strips hashes. Restore only this exact,
    // locally validated invitation fragment; never forward query credentials.
    const parsed = new URL(value ?? invitationRoute, "https://app.caudals.com");
    return invitationPath(invitationTokenFromFragment(parsed.hash));
  }
  if (
    pathname === "/ops" ||
    pathname === "/workspace/evaluations" ||
    pathname === "/evaluation-entry"
  )
    return pathname;
  return "/evaluation-entry";
}
export function evaluationSignInPath(next?: string) {
  const destination = evaluationReturnPath(next);
  return destination.includes("#")
    ? `/workspace/sign-in#next=${encodeURIComponent(destination)}`
    : `/workspace/sign-in?next=${encodeURIComponent(destination)}`;
}
export function evaluationRecoveryPath(next?: string) {
  // Password recovery is an independent flow. The private invitation must be
  // reopened afterwards; never embed its bearer in an emailed recovery URL.
  return `/workspace/reset-password?next=${encodeURIComponent(evaluationReturnPath(next).split("#")[0])}`;
}
