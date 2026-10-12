/**
 * Runtime switches and absolute links for Caudals email (launch L-07). Read
 * on the server (web and scheduler) at send time, never at build time.
 */

/** Branded EN/ES HTML templates for the emails users already receive. Off: the previous plain-text emails. */
export function brandedEmailsEnabled(env: Record<string, string | undefined> = process.env) {
  return env.BRANDED_EMAILS_ENABLED === "true";
}

/**
 * The From header. With branded email on, a bare sender address gets the
 * "Caudals" display name, so inboxes show the company rather than the address.
 */
export function senderAddress(from: string, env: Record<string, string | undefined> = process.env) {
  return brandedEmailsEnabled(env) && !from.includes("<") ? `Caudals <${from.trim()}>` : from;
}

/** Where accounts live (the app host), without a trailing slash. */
export function emailAppUrl(env: Record<string, string | undefined> = process.env) {
  const configured = env.EVALS_APP_URL?.trim() || env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }
  return env.NODE_ENV === "production" || !env.NODE_ENV ? "https://app.caudals.com" : "http://localhost:3000";
}

/**
 * The booking page for setup calls and readouts. `CALCOM_LINK` holds either a
 * Cal.com event slug (as on `/call`) or an absolute https URL.
 */
export function callUrl(env: Record<string, string | undefined> = process.env) {
  const value = (env.CALCOM_LINK ?? env.NEXT_PUBLIC_CALCOM_LINK)?.trim() || "caudals/call";
  if (/^https:\/\//i.test(value)) return value;
  return `https://cal.com/${value.replace(/^\/+/, "")}`;
}

/** The two unsubscribe links for lifecycle mail: a page (token in the fragment) and RFC 8058 one-click. */
export function unsubscribeLinks(token: string, base = emailAppUrl()) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("email_unsubscribe_token_invalid");
  return {
    pageUrl: `${base}/workspace/unsubscribe#${token}`,
    oneClickUrl: `${base}/api/evals/v1/email/unsubscribe?token=${token}`,
  };
}

export const workspaceLinks = (base: string, orgId: string) => {
  const org = encodeURIComponent(orgId);
  return {
    evaluations: `${base}/workspace/evaluations?orgId=${org}`,
    reports: `${base}/workspace/reports?orgId=${org}`,
    notificationSettings: `${base}/workspace/settings?orgId=${org}&tab=notifications`,
    billing: `${base}/workspace/settings?orgId=${org}&tab=billing`,
  };
};
