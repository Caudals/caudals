/**
 * Reads the help articles from `content/help/{en,es}/*.md` (Node only: the
 * build script and the content lint). The app reads the generated JSON
 * through ./articles.ts instead, so no Markdown file is opened per request.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { Locale } from "@/lib/evals/messages/en";
import { HELP_OWNERS, HELP_SLUGS, type HelpArticle, type HelpIndex } from "./articles";

export const HELP_CONTENT_DIR = join(process.cwd(), "content", "help");
export const HELP_LOCALES: readonly Locale[] = ["en", "es"];

const isoDate = z.preprocess(
  (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD"),
);

/** Front matter every article must carry. Unknown keys are refused, so a typo cannot pass silently. */
export const helpFrontMatterSchema = z.strictObject({
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().min(20).max(220),
  keywords: z.array(z.string().trim().min(2).max(40)).min(4).max(24),
  related: z.array(z.enum(HELP_SLUGS)).max(4).default([]),
  owner: z.enum(HELP_OWNERS),
  reviewed: isoDate,
  review_by: isoDate,
});

export type HelpSource = { locale: Locale; slug: string; file: string; raw: string; data: unknown; body: string };

/** Every Markdown file in one language, sorted by file name. */
export function readHelpSources(locale: Locale, root = HELP_CONTENT_DIR): HelpSource[] {
  const directory = join(root, locale);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const file = join(directory, name);
      const raw = readFileSync(file, "utf8");
      const parsed = matter(raw);
      return { locale, slug: name.replace(/\.md$/, ""), file, raw, data: parsed.data, body: parsed.content.trim() };
    });
}

/** Parses and orders one language's articles; throws on the first invalid front matter. */
export function buildHelpIndex(locale: Locale, root = HELP_CONTENT_DIR): HelpIndex {
  const bySlug = new Map(readHelpSources(locale, root).map((source) => [source.slug, source]));
  const articles: HelpArticle[] = HELP_SLUGS.map((slug) => {
    const source = bySlug.get(slug);
    if (!source) throw new Error(`content/help/${locale}/${slug}.md is missing`);
    const front = helpFrontMatterSchema.parse(source.data);
    return {
      slug,
      title: front.title,
      summary: front.summary,
      keywords: front.keywords,
      related: front.related,
      owner: front.owner,
      reviewed: front.reviewed,
      reviewBy: front.review_by,
      body: source.body,
    };
  });
  return { locale, articles };
}

/** The generated file's exact text (stable key order, trailing newline). */
export function serializeHelpIndex(index: HelpIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
