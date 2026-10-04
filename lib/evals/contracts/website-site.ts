import { getDomain } from "tldts";

/**
 * True when `host` belongs to the same site (registrable domain, per the
 * Public Suffix List including private suffixes such as vercel.app) as the
 * attested entry URL. A site's own auth subdomain (a Clerk, Auth0 or Okta
 * custom domain such as clerk.example.com) is same-site; a third-party
 * identity provider (accounts.google.com) or another tenant of a shared
 * hosting domain is not. IP addresses and single-label hosts match nothing.
 */
export function sameSiteHost(entry: string, host: string) {
  const site = getDomain(new URL(entry).hostname, { allowPrivateDomains: true });
  return !!site && getDomain(host.replace(/^\./, ""), { allowPrivateDomains: true }) === site;
}
