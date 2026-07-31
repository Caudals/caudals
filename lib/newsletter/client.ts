import { getSecretEnvValue } from "@/lib/env/secrets";

/**
 * Reads and writes for "The Data Gap".
 *
 * The newsletter lives in the leads Supabase project — the CRM writes the
 * issues, growth-social sends them — so this site is a reader and a signup
 * form, not an owner. Both jobs are two HTTP calls, so they go over fetch
 * rather than pulling the Supabase SDK into the landing bundle:
 *
 *   - the archive reads PostgREST with the anon key, which the RLS policy
 *     restricts to issues that have actually been sent and marked public;
 *   - signup posts to the `newsletter-subscribe` edge function, which is the
 *     only thing allowed to create a subscriber.
 */

const REVALIDATE_SECONDS = 300;

/**
 * Both call sites are server-side (archive pages and the subscribe route), so
 * the config is read from plain, non-public env names.
 *
 * This is not cosmetic. Next.js inlines `process.env.NEXT_PUBLIC_*` at *build*
 * time, in the server bundle too — reading the config through those names meant
 * the production image, built by CI without them, had `undefined` compiled in
 * and every signup silently took the "newsletter unavailable" branch no matter
 * what the container's runtime environment said. The `NEXT_PUBLIC_` names are
 * still honoured as a fallback for existing local setups.
 */
function config() {
  const url = (
    getSecretEnvValue("LEADS_SUPABASE_URL") ??
    process.env.NEXT_PUBLIC_LEADS_SUPABASE_URL
  )?.replace(/\/+$/, "");
  const anonKey =
    getSecretEnvValue("LEADS_SUPABASE_ANON_KEY") ??
    process.env.NEXT_PUBLIC_LEADS_SUPABASE_ANON_KEY;

  return { url, anonKey };
}

export function isNewsletterConfigured() {
  const { url, anonKey } = config();
  return Boolean(url && anonKey);
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

async function query<T>(path: string): Promise<T[]> {
  const { url, anonKey } = config();
  if (!url || !anonKey) return [];

  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: "application/json",
      },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      console.error("newsletter.query_failed", response.status, path);
      return [];
    }

    return (await response.json()) as T[];
  } catch (error) {
    // The archive is a nice-to-have on a marketing site: if the CRM project is
    // unreachable, the page renders its empty state rather than 500ing.
    console.error("newsletter.query_error", error);
    return [];
  }
}

export async function getPublishedIssues(limit = 30): Promise<NewsletterIssueSummary[]> {
  return query<NewsletterIssueSummary>(
    "newsletter_issues?select=id,number,slug,title,dek,pillar,sent_at" +
      "&published_web=eq.true&status=eq.sent" +
      `&order=sent_at.desc&limit=${limit}`
  );
}

export async function getPublishedIssue(
  slug: string
): Promise<NewsletterIssueDetail | null> {
  const issues = await query<NewsletterIssueSummary>(
    "newsletter_issues?select=id,number,slug,title,dek,pillar,sent_at" +
      `&published_web=eq.true&status=eq.sent&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );

  const issue = issues[0];
  if (!issue) return null;

  const blocks = await query<NewsletterBlock>(
    `newsletter_blocks?select=id,position,kind,content,pillar&issue_id=eq.${issue.id}` +
      "&order=position.asc"
  );

  return { ...issue, blocks };
}

export interface SubscribeResult {
  status: "confirmed" | "already_subscribed" | "unavailable";
  emailSent?: boolean;
}

/**
 * Server-side only: subscribes the address in the leads project.
 *
 * Single opt-in — the edge function confirms the subscriber on the spot and the
 * email it sends is a receipt, not a gate.
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
  const { url, anonKey } = config();
  if (!url || !anonKey) {
    // Loud on purpose: this is a misconfiguration, not a visitor error, and the
    // previous silence is what let a dead signup box look healthy in production.
    console.error("newsletter.subscribe_unconfigured", {
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
    });
    return { status: "unavailable" };
  }

  try {
    const response = await fetch(`${url}/functions/v1/newsletter-subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
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
      status: payload.status === "already_subscribed" ? "already_subscribed" : "confirmed",
      emailSent: payload.email_sent ?? false,
    };
  } catch (error) {
    console.error("newsletter.subscribe_error", error);
    return { status: "unavailable" };
  }
}
