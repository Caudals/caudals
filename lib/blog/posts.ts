import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "@/components/blog/mdx-components";
import { defaultLocale, type Locale, locales } from "@/lib/i18n/config";
import {
  estimateReadTimeMinutes,
  normalizeTopicKey,
  slugifyHeading,
} from "@/lib/blog/shared";
import type {
  BlogCoverVariant,
  BlogFrontmatter,
  BlogHeading,
  BlogPost,
  BlogPostSummary,
} from "@/lib/blog/types";
import { assertBlogSource } from "@/lib/blog/preflight";
import {
  getPublishedBlogPost,
  getPublishedBlogPosts,
  type PublishedBlogArticle,
  type PublishedBlogRecord,
} from "@/lib/blog/client";

const BLOG_CONTENT_ROOT = path.join(process.cwd(), "content", "blog");
const BLOG_FILE_EXTENSION = ".mdx";
const COVER_VARIANTS: BlogCoverVariant[] = ["signal", "grid", "ledger"];

function ensureString(value: unknown, fieldName: string, slug: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid or missing "${fieldName}" in blog post "${slug}"`);
  }

  return value.trim();
}

function ensureDateString(value: unknown, fieldName: string, slug: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  throw new Error(`Invalid or missing "${fieldName}" in blog post "${slug}"`);
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function ensureBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function ensureCoverVariant(value: unknown) {
  return COVER_VARIANTS.includes(value as BlogCoverVariant)
    ? (value as BlogCoverVariant)
    : "signal";
}

function parseFrontmatter(data: Record<string, unknown>, slug: string): BlogFrontmatter {
  return {
    title: ensureString(data.title, "title", slug),
    excerpt: ensureString(data.excerpt, "excerpt", slug),
    publishedAt: ensureDateString(data.publishedAt, "publishedAt", slug),
    author: ensureString(data.author, "author", slug),
    authorRole: ensureString(data.authorRole, "authorRole", slug),
    category: ensureString(data.category, "category", slug),
    categoryKey: normalizeTopicKey(ensureString(data.categoryKey, "categoryKey", slug)),
    tags: ensureStringArray(data.tags),
    featured: ensureBoolean(data.featured),
    coverVariant: ensureCoverVariant(data.coverVariant),
  };
}

/** True when the path is readable, whether it is a file or a directory. */
async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getLocaleDirectory(locale: Locale) {
  const targetDirectory = path.join(BLOG_CONTENT_ROOT, locale);
  const exists = await pathExists(targetDirectory);
  if (exists) {
    return targetDirectory;
  }

  const fallbackDirectory = path.join(BLOG_CONTENT_ROOT, defaultLocale);
  return (await pathExists(fallbackDirectory)) ? fallbackDirectory : null;
}

async function getSlugsForLocale(locale: Locale) {
  const directory = await getLocaleDirectory(locale);
  if (!directory) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(BLOG_FILE_EXTENSION))
    .map((entry) => entry.name.replace(new RegExp(`${BLOG_FILE_EXTENSION}$`), ""));
}

async function getFilePathForSlug(locale: Locale, slug: string) {
  const preferredPath = path.join(BLOG_CONTENT_ROOT, locale, `${slug}${BLOG_FILE_EXTENSION}`);
  if (await pathExists(preferredPath)) {
    return preferredPath;
  }

  const fallbackPath = path.join(BLOG_CONTENT_ROOT, defaultLocale, `${slug}${BLOG_FILE_EXTENSION}`);
  if (await pathExists(fallbackPath)) {
    return fallbackPath;
  }

  return null;
}

function extractHeadings(source: string): BlogHeading[] {
  const headings: BlogHeading[] = [];
  const lines = source.split(/\r?\n/);
  let insideCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      insideCodeFence = !insideCodeFence;
      continue;
    }

    if (insideCodeFence) {
      continue;
    }

    const match = line.match(/^(##|###)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const level = match[1].length as 2 | 3;
    const rawTitle = match[2]
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!rawTitle) {
      continue;
    }

    headings.push({
      id: slugifyHeading(rawTitle),
      level,
      title: rawTitle,
    });
  }

  return headings;
}

async function readPostSummaryFromFile(filePath: string, locale: Locale) {
  const slug = path.basename(filePath, BLOG_FILE_EXTENSION);
  try {
    const source = await fs.readFile(filePath, "utf8");
    assertBlogSource(source, { slug, locale });
    const { data, content } = matter(source);
    const frontmatter = parseFrontmatter(data, slug);

    return {
      ...frontmatter,
      locale,
      readTimeMinutes: estimateReadTimeMinutes(content),
      slug,
    } satisfies BlogPostSummary;
  } catch (error) {
    console.error(`[Blog Engine] Failed to read post summary for "${slug}" in locale "${locale}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function remoteFrontmatter(post: PublishedBlogRecord): BlogFrontmatter {
  return parseFrontmatter({
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt.slice(0, 10),
    author: post.author,
    authorRole: post.authorRole,
    category: post.category,
    categoryKey: post.categoryKey,
    tags: post.tags,
    featured: post.featured,
    coverVariant: post.coverVariant,
  }, post.slug);
}

function remoteSummary(post: PublishedBlogRecord, locale: Locale): BlogPostSummary | null {
  try {
    return {
      ...remoteFrontmatter(post),
      locale,
      readTimeMinutes: typeof post.readTimeMinutes === "number" && post.readTimeMinutes > 0
        ? post.readTimeMinutes
        : 1,
      slug: post.slug,
    };
  } catch (error) {
    console.error(`[Blog Engine] Rejected archive summary "${post.slug}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function compileRemotePost(post: PublishedBlogArticle, locale: Locale): Promise<BlogPost | null> {
  try {
    const frontmatter = remoteFrontmatter(post);
    // Apply the exact same publishing contract to database content as to
    // repository MDX before handing it to the compiler.
    const source = matter.stringify(post.bodyMdx, frontmatter);
    assertBlogSource(source, { slug: post.slug, locale });
    const headings = extractHeadings(post.bodyMdx);
    const { content } = await compileMDX({
      source: post.bodyMdx,
      components: mdxComponents,
      options: {
        parseFrontmatter: false,
        mdxOptions: { remarkPlugins: [remarkGfm] },
      },
    });
    return {
      ...frontmatter,
      content,
      headings,
      locale,
      readTimeMinutes: post.readTimeMinutes ?? estimateReadTimeMinutes(post.bodyMdx),
      slug: post.slug,
    };
  } catch (error) {
    console.error(`[Blog Engine] Rejected archive post "${post.slug}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function getBlogPosts(locale: Locale) {
  const resolvedLocale = locale;
  const primarySlugs = await getSlugsForLocale(resolvedLocale);
  const fallbackSlugs =
    resolvedLocale === defaultLocale ? [] : await getSlugsForLocale(defaultLocale);
  const allSlugs = Array.from(new Set([...primarySlugs, ...fallbackSlugs]));

  const [posts, published] = await Promise.all([
    Promise.all(
      allSlugs.map(async (slug) => {
        const filePath = await getFilePathForSlug(resolvedLocale, slug);
        if (!filePath) {
          return null;
        }

        return readPostSummaryFromFile(filePath, resolvedLocale);
      }),
    ),
    getPublishedBlogPosts(resolvedLocale),
  ]);

  const merged = new Map<string, BlogPostSummary>();
  for (const post of posts) {
    if (post) merged.set(post.slug, post);
  }
  // The CMS is authoritative for matching slugs, allowing an editorial update
  // to become visible without modifying or rebuilding this repository.
  for (const record of published) {
    const post = remoteSummary(record, resolvedLocale);
    if (post) merged.set(post.slug, post);
  }

  return [...merged.values()]
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
}

export async function getBlogPost(slug: string, locale: Locale) {
  const resolvedLocale = locale;
  const published = await getPublishedBlogPost(slug, resolvedLocale);
  if (published) {
    const compiled = await compileRemotePost(published, resolvedLocale);
    if (compiled) return compiled;
  }
  const filePath = await getFilePathForSlug(resolvedLocale, slug);

  if (!filePath) {
    return null;
  }

  try {
    const source = await fs.readFile(filePath, "utf8");
    assertBlogSource(source, { slug, locale: resolvedLocale });
    const { data, content: rawContent } = matter(source);
    const frontmatter = parseFrontmatter(data, slug);
    const headings = extractHeadings(rawContent);
    const { content } = await compileMDX({
      source: rawContent,
      components: mdxComponents,
      options: {
        parseFrontmatter: false,
        mdxOptions: {
          remarkPlugins: [remarkGfm],
        },
      },
    });

    return {
      ...frontmatter,
      content,
      headings,
      locale: resolvedLocale,
      readTimeMinutes: estimateReadTimeMinutes(rawContent),
      slug,
    } satisfies BlogPost;
  } catch (error) {
    console.error(`[Blog Engine] Failed to read post for "${slug}" in locale "${resolvedLocale}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function getAdjacentBlogPosts(slug: string, locale: Locale) {
  const posts = await getBlogPosts(locale);
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previous: index >= 0 ? posts[index + 1] ?? null : null,
    next: index >= 0 ? posts[index - 1] ?? null : null,
  };
}

export async function getAllBlogSlugs() {
  const [slugSets, published] = await Promise.all([
    Promise.all(locales.map((locale) => getSlugsForLocale(locale))),
    Promise.all(locales.map((locale) => getPublishedBlogPosts(locale))),
  ]);
  return Array.from(new Set([
    ...slugSets.flat(),
    ...published.flat().map((post) => post.slug),
  ])).sort();
}
