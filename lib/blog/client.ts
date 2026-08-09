import "server-only";

import { getSecretEnvValue } from "@/lib/env/secrets";
import type { Locale } from "@/lib/i18n/config";

const REVALIDATE_SECONDS = 60;

export interface PublishedBlogRecord {
  slug: string;
  locale: Locale;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  authorRole: string;
  category: string;
  categoryKey: string;
  tags: string[];
  featured: boolean;
  coverVariant: "signal" | "grid" | "ledger";
  readTimeMinutes: number | null;
  heroUrl: string | null;
}

export interface PublishedBlogArticle extends PublishedBlogRecord {
  bodyMdx: string;
}

function endpoint() {
  return (
    getSecretEnvValue("LEADS_BLOG_API_URL") ??
    "https://leads.caudals.com/api/blog"
  ).replace(/\/+$/, "");
}

async function query<T>(path: string): Promise<T | null> {
  // Unit tests exercise the deterministic repository fallback and must never
  // depend on a production service or network timing.
  if (
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) return null;

  try {
    const response = await fetch(`${endpoint()}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      console.error("blog_archive.query_failed", response.status, path);
      return null;
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      console.error("blog_archive.invalid_content_type", path);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    // Static MDX remains a deliberate resilience fallback: an unavailable CRM
    // must not take the established blog archive down with it.
    console.error("blog_archive.query_error", error);
    return null;
  }
}

export async function getPublishedBlogPosts(locale: Locale): Promise<PublishedBlogRecord[]> {
  const payload = await query<unknown>(`?locale=${encodeURIComponent(locale)}&limit=200`);
  return Array.isArray(payload) ? payload as PublishedBlogRecord[] : [];
}

export async function getPublishedBlogPost(
  slug: string,
  locale: Locale,
): Promise<PublishedBlogArticle | null> {
  const payload = await query<unknown>(`/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`);
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as PublishedBlogArticle
    : null;
}
