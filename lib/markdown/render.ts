import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { getBlogPosts } from "@/lib/blog/posts";
import { getPublishedBlogPost } from "@/lib/blog/client";
import { getPublishedIssue, getPublishedIssues } from "@/lib/newsletter/client";
import type { NewsletterBlock } from "@/lib/newsletter/client";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { buildMarketingUrl } from "@/lib/seo";

const BLOG_CONTENT_ROOT = path.join(process.cwd(), "content", "blog");

function frontmatterBlock(fields: Record<string, string | undefined>) {
  const lines = Object.entries(fields)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`);
  return lines.length ? `${lines.join("\n")}\n\n---\n` : "";
}

function canonicalFooter(pathname: string) {
  return `\n\n---\n\nCanonical URL: ${buildMarketingUrl(pathname)}`;
}

/** Reads the raw MDX body for a repository-hosted post, if present. */
async function readLocalPostSource(slug: string, locale: Locale) {
  for (const candidate of [locale, defaultLocale]) {
    const filePath = path.join(BLOG_CONTENT_ROOT, candidate, `${slug}.mdx`);
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Markdown for a single blog post.
 *
 * The MDX body is the source the HTML page is itself compiled from, so serving
 * it is both the cheapest and the highest-fidelity representation available.
 */
export async function renderBlogPostMarkdown(slug: string, locale: Locale) {
  const published = await getPublishedBlogPost(slug, locale);
  if (published) {
    const header = frontmatterBlock({
      excerpt: published.excerpt,
      author: published.author,
      published: published.publishedAt.slice(0, 10),
      category: published.category,
      tags: published.tags.join(", "),
    });
    return `# ${published.title}\n\n${header}\n${published.bodyMdx.trim()}${canonicalFooter(`/blog/${slug}`)}`;
  }

  const source = await readLocalPostSource(slug, locale);
  if (!source) return null;

  const { data, content } = matter(source);
  const title = typeof data.title === "string" ? data.title : slug;
  const header = frontmatterBlock({
    excerpt: typeof data.excerpt === "string" ? data.excerpt : undefined,
    author: typeof data.author === "string" ? data.author : undefined,
    published: typeof data.publishedAt === "string" ? data.publishedAt.slice(0, 10) : undefined,
    category: typeof data.category === "string" ? data.category : undefined,
    tags: Array.isArray(data.tags) ? data.tags.join(", ") : undefined,
  });

  return `# ${title}\n\n${header}\n${content.trim()}${canonicalFooter(`/blog/${slug}`)}`;
}

/** Markdown index of the blog. */
export async function renderBlogIndexMarkdown(locale: Locale) {
  const posts = await getBlogPosts(locale);
  const entries = posts
    .map(
      (post) =>
        `- [${post.title}](${buildMarketingUrl(`/blog/${post.slug}`)}) — ${post.publishedAt} · ${post.author}\n  ${post.excerpt}`,
    )
    .join("\n");

  return `# Blog de Caudals\n\nNotas sobre cómo evaluar sistemas de IA y los datos que los hacen fiables.\n\n${
    entries || "_No hay artículos publicados._"
  }${canonicalFooter("/blog")}`;
}

function stringField(content: Record<string, unknown>, key: string) {
  const value = content[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Converts one stored newsletter block to its markdown equivalent. */
function newsletterBlockToMarkdown(block: NewsletterBlock): string | null {
  const content = block.content ?? {};

  switch (block.kind) {
    case "heading": {
      const level = Number(content["level"] ?? 2) <= 2 ? "##" : "###";
      const text = stringField(content, "text");
      return text ? `${level} ${text}` : null;
    }
    case "text":
      return stringField(content, "markdown") || null;
    case "image": {
      const url = stringField(content, "url");
      if (!url) return null;
      const caption = stringField(content, "caption");
      return `![${stringField(content, "alt")}](${url})${caption ? `\n\n_${caption}_` : ""}`;
    }
    case "tool_card": {
      const name = stringField(content, "name");
      if (!name) return null;
      const url = stringField(content, "url");
      const parts = [`### ${url ? `[${name}](${url})` : name}`];
      for (const key of ["what_for", "verdict", "price"]) {
        const value = stringField(content, key);
        if (value) parts.push(value);
      }
      return parts.join("\n\n");
    }
    case "link_list": {
      const raw = content["items"];
      if (!Array.isArray(raw)) return null;
      const items = raw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => {
          const title = stringField(item, "title");
          const url = stringField(item, "url");
          if (!title || !url) return null;
          const note = stringField(item, "note");
          return `- [${title}](${url})${note ? ` — ${note}` : ""}`;
        })
        .filter((line): line is string => line !== null);
      return items.length ? items.join("\n") : null;
    }
    case "quote": {
      const text = stringField(content, "text");
      if (!text) return null;
      const attribution = stringField(content, "attribution");
      const quoted = text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return attribution ? `${quoted}\n>\n> — ${attribution}` : quoted;
    }
    case "video": {
      const url = stringField(content, "url");
      if (!url) return null;
      return `[${stringField(content, "title") || "Ver el vídeo"}](${url})`;
    }
    case "code": {
      const source = stringField(content, "source");
      if (!source) return null;
      return `\`\`\`${stringField(content, "language")}\n${source}\n\`\`\``;
    }
    case "divider":
      return "---";
    case "cta": {
      const label = stringField(content, "label");
      const url = stringField(content, "url");
      if (!label || !url) return null;
      const note = stringField(content, "note");
      return `[${label}](${url})${note ? `\n\n${note}` : ""}`;
    }
    default:
      return null;
  }
}

/** Markdown for a single newsletter issue. */
export async function renderNewsletterIssueMarkdown(slug: string) {
  const issue = await getPublishedIssue(slug);
  if (!issue) return null;

  const header = frontmatterBlock({
    dek: issue.dek ?? undefined,
    issue: issue.number != null ? String(issue.number) : undefined,
    published: issue.sent_at ? issue.sent_at.slice(0, 10) : undefined,
  });

  const body = [...issue.blocks]
    .sort((a, b) => a.position - b.position)
    .map(newsletterBlockToMarkdown)
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return `# ${issue.title}\n\n${header}\n${body}${canonicalFooter(`/newsletter/${slug}`)}`;
}

/** Markdown index of the newsletter archive. */
export async function renderNewsletterIndexMarkdown() {
  const issues = await getPublishedIssues(50);
  const entries = issues
    .map((issue) => {
      const label = issue.number != null ? `#${issue.number} — ${issue.title}` : issue.title;
      const date = issue.sent_at ? ` (${issue.sent_at.slice(0, 10)})` : "";
      return `- [${label}](${buildMarketingUrl(`/newsletter/${issue.slug}`)})${date}${
        issue.dek ? `\n  ${issue.dek}` : ""
      }`;
    })
    .join("\n");

  return `# Data Unfiltered\n\nAnálisis periódico sobre herramientas de IA y los datos que utilizan los modelos.\n\n${
    entries || "_No hay números publicados._"
  }${canonicalFooter("/newsletter")}`;
}
