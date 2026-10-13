/**
 * In-app help centre (launch L-20, P-39). Articles are Markdown in
 * `content/help/{en,es}/<slug>.md`; `scripts/evals/build-help.ts` turns them
 * into `generated/{en,es}.json`, which this module reads on the server and in
 * the browser. The content lint (`content.test.ts`) keeps the two in step and
 * checks front matter, EN/ES parity and review dates.
 *
 * Client-safe: no Node APIs here.
 */
import type { Locale } from "@/lib/evals/messages/en";
import { blocksText, parseMarkdown, type Block } from "./markdown";

/** Every article, in the order the help centre lists them. Slugs are shared by both languages. */
export const HELP_SLUGS = [
  "connect-website-chat",
  "connect-api",
  "uploads",
  "prepare-and-run",
  "reading-results",
  "reports-and-sharing",
  "schedules-and-alerts",
  "credits-and-billing",
  "data-and-privacy",
  "team-and-roles",
  "free-test",
  "getting-help",
] as const;
export type HelpSlug = (typeof HELP_SLUGS)[number];

/** People and roles accountable for keeping an article true. */
export const HELP_OWNERS = ["founder", "operations", "engineering"] as const;
export type HelpOwner = (typeof HELP_OWNERS)[number];

export type HelpArticle = {
  slug: HelpSlug;
  title: string;
  summary: string;
  keywords: string[];
  related: HelpSlug[];
  owner: HelpOwner;
  /** ISO date the article was last checked against the product. */
  reviewed: string;
  /** ISO date by which it must be checked again. */
  reviewBy: string;
  /** Markdown body (the subset in ./markdown.ts). */
  body: string;
};

export type HelpIndex = { locale: Locale; articles: HelpArticle[] };

export function isHelpSlug(value: string): value is HelpSlug {
  return (HELP_SLUGS as readonly string[]).includes(value);
}

/** Where an article is shown in full. */
export function helpArticlePath(slug: HelpSlug, section?: string) {
  return `/workspace/help/${slug}${section ? `#${section}` : ""}`;
}

/** The contextual "?" links beside each step: the article and, where useful, the section. */
export const CONTEXT_HELP = {
  connectWebsite: { slug: "connect-website-chat", section: "live-browser" },
  connectApi: { slug: "connect-api", section: "add" },
  connectUpload: { slug: "uploads", section: "answers" },
  connectPrivate: { slug: "connect-api", section: "private" },
  sources: { slug: "uploads", section: "documents" },
  prepare: { slug: "prepare-and-run", section: "generate" },
  run: { slug: "prepare-and-run", section: "run" },
  results: { slug: "reading-results" },
  monitoring: { slug: "schedules-and-alerts" },
} as const satisfies Record<string, { slug: HelpSlug; section?: string }>;
export type HelpContextKey = keyof typeof CONTEXT_HELP;

/* ------------------------------------------------------------------ load --- */

const cache = new Map<Locale, Promise<HelpIndex>>();

/**
 * The articles in one language. The JSON is split per language and imported
 * on demand, so the shell bundle does not carry it until help is opened.
 */
export function loadHelpIndex(locale: Locale): Promise<HelpIndex> {
  let pending = cache.get(locale);
  if (!pending) {
    pending = (locale === "es" ? import("./generated/es.json") : import("./generated/en.json")).then(
      (module) => ("default" in module ? module.default : module) as unknown as HelpIndex,
    );
    cache.set(locale, pending);
    pending.catch(() => cache.delete(locale));
  }
  return pending;
}

/* ---------------------------------------------------------------- search --- */

const STOPWORDS = new Set([
  // English
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why", "with", "you", "your",
  // Spanish
  "al", "como", "con", "cual", "cuando", "de", "del", "donde", "el", "en", "es", "la", "las", "lo", "los", "mi", "mis", "para", "por", "puedo", "que", "se", "su", "sus", "tu", "tus", "un", "una", "y", "o",
]);

/** Lower-case and accent-free, so "configuración" finds "configuracion". */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

export function searchTokens(query: string): string[] {
  return [...new Set(foldText(query).split(/[^a-z0-9:]+/).filter((token) => token.length > 1 && !STOPWORDS.has(token)))];
}

type Indexed = { article: HelpArticle; fields: Array<{ words: string[]; weight: number }> };
const indexed = new WeakMap<HelpArticle, Indexed>();

function words(value: string) {
  return foldText(value).split(/[^a-z0-9:]+/).filter(Boolean);
}

function indexArticle(article: HelpArticle): Indexed {
  const existing = indexed.get(article);
  if (existing) return existing;
  const blocks = parseMarkdown(article.body);
  const headings = blocks.filter((block): block is Extract<Block, { kind: "heading" }> => block.kind === "heading").map((block) => block.text);
  const entry: Indexed = {
    article,
    fields: [
      { words: words(article.title), weight: 6 },
      { words: article.keywords.flatMap(words), weight: 5 },
      { words: words(headings.join(" ")), weight: 3 },
      { words: words(article.summary), weight: 3 },
      { words: words(blocksText(blocks)), weight: 1 },
    ],
  };
  indexed.set(article, entry);
  return entry;
}

/**
 * Articles that match a query, best first. Each word of the query (stop words
 * aside) scores where it appears: title, keywords, headings, summary, body. A
 * word matches the start of a word in the article, so "invit" finds
 * "invitation". With no usable words the list is returned unchanged.
 */
export function searchHelp(articles: HelpArticle[], query: string): HelpArticle[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return articles;
  return articles
    .map((article) => {
      const { fields } = indexArticle(article);
      let score = 0,
        matched = 0;
      for (const token of tokens) {
        let best = 0;
        for (const field of fields) {
          if (field.words.some((word) => word === token)) best = Math.max(best, field.weight * 2);
          else if (field.words.some((word) => word.startsWith(token))) best = Math.max(best, field.weight);
        }
        if (best) matched += 1;
        score += best;
      }
      // Every word matched ranks above a partial match.
      return { article, score: score + (matched === tokens.length ? 100 : 0), matched };
    })
    .filter((entry) => entry.matched > 0)
    .sort((a, b) => b.score - a.score || HELP_SLUGS.indexOf(a.article.slug) - HELP_SLUGS.indexOf(b.article.slug))
    .map((entry) => entry.article);
}
