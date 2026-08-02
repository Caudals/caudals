import { getSecretEnvValue } from "@/lib/env/secrets";

/**
 * Reads and writes for "The Data Gap".
 *
 * Leads owns the newsletter records and delivery. This site is only a public
 * reader and signup form, and reaches the narrow public API exposed by the
 * Node/Better Auth runtime. It never receives a database or provider key.
 */

const REVALIDATE_SECONDS = 300;

/**
 * Both call sites are server-side. Production uses the public Leads hostname;
 * local or private environments can override it without exposing a secret.
 */
function config() {
  const url = (
    getSecretEnvValue("LEADS_NEWSLETTER_API_URL") ??
    "https://leads.caudals.com/api/newsletter"
  ).replace(/\/+$/, "");
  return { url };
}

export function isNewsletterConfigured() {
  return Boolean(config().url);
}

export type NewsletterBlockKind =
  | "heading"
  | "text"
  | "image"
  | "tool_card"
  | "link_list"
  | "quote"
  | "video"
  | "code"
  | "divider"
  | "cta";

export interface NewsletterBlock {
  id: string;
  position: number;
  kind: NewsletterBlockKind;
  content: Record<string, unknown>;
  pillar: string | null;
}

export interface NewsletterIssueSummary {
  id: string;
  number: number | null;
  slug: string;
  title: string;
  dek: string | null;
  pillar: string | null;
  sent_at: string | null;
}

export interface NewsletterIssueDetail extends NewsletterIssueSummary {
  blocks: NewsletterBlock[];
}

async function query<T>(path: string): Promise<T | null> {
  const { url } = config();

  try {
    const response = await fetch(`${url}/${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      console.error("newsletter.query_failed", response.status, path);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    // The archive is a nice-to-have on a marketing site: if the CRM project is
    // unreachable, the page renders its empty state rather than 500ing.
    console.error("newsletter.query_error", error);
    return null;
  }
}

export async function getPublishedIssues(limit = 30): Promise<NewsletterIssueSummary[]> {
  return (await query<NewsletterIssueSummary[]>(`issues?limit=${Math.max(1, Math.min(limit, 100))}`)) ?? [];
}

export async function getPublishedIssue(
  slug: string
): Promise<NewsletterIssueDetail | null> {
  return query<NewsletterIssueDetail>(`issues/${encodeURIComponent(slug)}`);
}

export interface SubscribeResult {
  status: "pending" | "already_subscribed" | "unavailable";
  emailSent?: boolean;
}

/**
 * Server-side only: starts the double-opt-in flow in Leads.
 *
 * Never returns whether the address was already on the list in a way a caller
 * could use to enumerate subscribers — the edge function answers the same shape
 * either way, and this preserves that.
 */
export async function subscribeToNewsletter(input: {
  email: string;
  source: string;
  sourceUrl?: string;
  fullName?: string;
  locale?: string;
  ip?: string;
  userAgent?: string;
}): Promise<SubscribeResult> {
  const { url } = config();

  try {
    const response = await fetch(`${url}/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Forwarded so the consent record keeps the visitor's provenance
        // rather than the hash of a Vercel edge node.
        ...(input.ip ? { "x-forwarded-for": input.ip } : {}),
        ...(input.userAgent ? { "user-agent": input.userAgent } : {}),
      },
      body: JSON.stringify({
        email: input.email,
        source: input.source,
        source_url: input.sourceUrl,
        full_name: input.fullName,
        locale: input.locale ?? "es",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "newsletter.subscribe_failed",
        response.status,
        (await response.text().catch(() => "")).slice(0, 300)
      );
      return { status: "unavailable" };
    }

    const payload = (await response.json()) as {
      status?: string;
      email_sent?: boolean;
    };

    return {
      status: payload.status === "already_subscribed" ? "already_subscribed" : "pending",
      emailSent: payload.email_sent ?? false,
    };
  } catch (error) {
    console.error("newsletter.subscribe_error", error);
    return { status: "unavailable" };
  }
}
