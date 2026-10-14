/**
 * Pseudonymous workspace reference for links that leave a report (launch
 * L-17, spec P-11 and P-21): the readout booking link carries it as Cal.com
 * metadata, and the shared report's "Test your own assistant free" link
 * carries it as the demo referral code. A one-way hash of the workspace id,
 * never the id itself. Web Crypto, so the browser and the server compute the
 * same value.
 */
import { localizePathname } from "@/lib/i18n/routing";

const PREFIX = "caudals-workspace-ref-v1:";

export async function workspaceRef(orgId: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${PREFIX}${orgId}`));
  return [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The demo referral code a shared report carries: `sr-` plus the workspace reference. */
export async function shareReferralCode(orgId: string): Promise<string> {
  return `sr-${await workspaceRef(orgId)}`;
}

/**
 * The booking link with its source context as Cal.com metadata. `base` is the
 * configured booking page (`callUrl()`): a cal.com URL or any https URL.
 */
export function readoutLink(base: string, source: "report" | "share", ref?: string | null): string {
  try {
    const url = new URL(base);
    url.searchParams.set("metadata[source]", source);
    if (ref) url.searchParams.set("metadata[workspace]", ref);
    return url.toString();
  } catch {
    return base;
  }
}

/** The public demo with the share page's referral (utm source, medium, campaign and the code). */
export function demoReferralLink(marketingOrigin: string, locale: "en" | "es", code?: string | null): string {
  const url = new URL(`/${locale}/demo`, marketingOrigin);
  url.searchParams.set("utm_source", "shared_report");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", "report_share");
  if (code) url.searchParams.set("ref", code);
  return url.toString();
}

/**
 * The vendor fix-list page's invitation (launch P-54): a vendor that builds
 * assistants is a prospective partner (launch L-28). Both links carry the
 * sharing workspace's referral code, like the shared report's demo link: the
 * free test, and the contact form to ask about the partner programme.
 */
export function vendorReferralLinks(marketingOrigin: string, locale: "en" | "es", code?: string | null): { demo: string; partner: string } {
  const tag = (url: URL) => {
    url.searchParams.set("utm_source", "vendor_fix_list");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "partner_programme");
    if (code) url.searchParams.set("ref", code);
    return url.toString();
  };
  const partner = new URL(localizePathname("/contact", locale), marketingOrigin);
  partner.searchParams.set("offer", "not-sure");
  return { demo: tag(new URL(`/${locale}/demo`, marketingOrigin)), partner: tag(partner) };
}
