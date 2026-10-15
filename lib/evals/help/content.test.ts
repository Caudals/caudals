/**
 * Content lint for the help centre (launch L-20). Part of the image build
 * (Dockerfile), so an article with broken front matter, a missing translation,
 * a dead link or a stale generated index cannot be deployed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localizePathname, toInternalPathname } from "@/lib/i18n/routing";
import { CONTEXT_HELP, HELP_SLUGS, type HelpArticle } from "./articles";
import { linkTargets, markdownProblems, parseMarkdown, type Block } from "./markdown";
import { buildHelpIndex, HELP_CONTENT_DIR, HELP_LOCALES, readHelpSources, serializeHelpIndex } from "./source";

const index = Object.fromEntries(HELP_LOCALES.map((locale) => [locale, buildHelpIndex(locale)])) as Record<"en" | "es", ReturnType<typeof buildHelpIndex>>;
const article = (locale: "en" | "es", slug: string) => index[locale].articles.find((item) => item.slug === slug)!;
const h2 = (item: HelpArticle) =>
  parseMarkdown(item.body)
    .filter((block): block is Extract<Block, { kind: "heading" }> => block.kind === "heading" && block.level === 2)
    .map((block) => block.id);
const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);

/** Public pages an article may link to on caudals.com (internal paths). */
const PUBLIC_PATHS = new Set(["/", "/demo", "/methodology", "/call", "/contact", "/sectors", "/legal/terms", "/legal/privacy", "/legal/dpa", "/legal/subprocessors", "/legal/security", "/legal/cookies", "/legal/notice"]);

describe("help centre content", () => {
  it("has every article in both languages and nothing else", () => {
    for (const locale of HELP_LOCALES) {
      const files = readdirSync(join(HELP_CONTENT_DIR, locale)).filter((name) => name.endsWith(".md")).map((name) => name.replace(/\.md$/, "")).sort();
      expect(files, locale).toEqual([...HELP_SLUGS].sort());
    }
    expect(HELP_SLUGS).toHaveLength(12);
  });

  it("keeps the generated index in step with the Markdown (run scripts/evals/build-help.ts)", () => {
    for (const locale of HELP_LOCALES) {
      const committed = readFileSync(join(process.cwd(), "lib/evals/help/generated", `${locale}.json`), "utf8");
      expect(committed, `lib/evals/help/generated/${locale}.json is stale`).toBe(serializeHelpIndex(index[locale]));
    }
  });

  it("gives every article an owner and a review date that is not in the future", () => {
    for (const locale of HELP_LOCALES) {
      for (const item of index[locale].articles) {
        const where = `${locale}/${item.slug}`;
        expect(item.reviewed <= today, `${where}: reviewed ${item.reviewed} is in the future`).toBe(true);
        expect(item.reviewBy > item.reviewed, `${where}: review_by must follow reviewed`).toBe(true);
        expect(Date.parse(item.reviewBy) - Date.parse(item.reviewed) <= 366 * DAY, `${where}: review at least once a year`).toBe(true);
        expect(item.owner, where).toBeTruthy();
      }
    }
  });

  it("keeps English and Spanish in step: owner, dates, related articles and sections", () => {
    for (const slug of HELP_SLUGS) {
      const en = article("en", slug), es = article("es", slug);
      expect({ owner: es.owner, reviewed: es.reviewed, reviewBy: es.reviewBy, related: es.related }, slug).toEqual({ owner: en.owner, reviewed: en.reviewed, reviewBy: en.reviewBy, related: en.related });
      expect(h2(es), `${slug}: section anchors`).toEqual(h2(en));
      const helpLinks = (item: HelpArticle) => linkTargets(parseMarkdown(item.body)).filter((href) => href.startsWith("help:")).sort();
      expect(helpLinks(es), `${slug}: links to other articles`).toEqual(helpLinks(en));
      expect(es.title).not.toBe(en.title);
    }
  });

  it("uses only the supported Markdown, with a stable anchor on every section", () => {
    for (const locale of HELP_LOCALES) {
      for (const source of readHelpSources(locale)) {
        expect(markdownProblems(source.body), `${locale}/${source.slug}`).toEqual([]);
        for (const line of source.body.split("\n").filter((value) => value.startsWith("## "))) {
          expect(line, `${locale}/${source.slug}: add {#id} to the heading`).toMatch(/\{#[a-z0-9-]+\}\s*$/);
        }
        expect(h2(article(locale, source.slug)).length, `${locale}/${source.slug}`).toBeGreaterThan(0);
      }
    }
  });

  it("links only to existing articles, sections, app pages and public pages in the same language", () => {
    for (const locale of HELP_LOCALES) {
      for (const item of index[locale].articles) {
        for (const href of linkTargets(parseMarkdown(item.body))) {
          const where = `${locale}/${item.slug} → ${href}`;
          if (href.startsWith("help:")) {
            const [slug, section] = href.slice(5).split("#");
            expect(HELP_SLUGS as readonly string[], where).toContain(slug);
            if (section) expect(h2(article(locale, slug)), where).toContain(section);
          } else if (href.startsWith("https://caudals.com/")) {
            const url = new URL(href);
            const [, prefix, ...rest] = url.pathname.split("/");
            expect(prefix, `${where}: link to the ${locale} page`).toBe(locale);
            const internal = toInternalPathname(`/${rest.join("/")}`, locale);
            expect(PUBLIC_PATHS.has(internal), `${where}: unknown public page`).toBe(true);
            expect(url.pathname, `${where}: use the translated path`).toBe(localizePathname(internal, locale));
          } else {
            expect(href, where).toMatch(/^(\/workspace\/[a-z0-9/?=&#-]*|mailto:[\w.+-]+@caudals\.com)$/);
          }
        }
      }
    }
  });

  it("makes no certification or compliance claims and leaves no placeholders", () => {
    for (const locale of HELP_LOCALES) {
      for (const source of readHelpSources(locale)) {
        expect(source.raw, `${locale}/${source.slug}`).not.toMatch(/\b(certif(y|ied|ies|ication)|compliant|certificad[oa]s?|homologad[oa]s?)\b/i);
        expect(source.raw, `${locale}/${source.slug}`).not.toMatch(/\b(TODO|TBD|FIXME)\b|lorem ipsum|\[\[/);
      }
    }
  });

  it("quotes with typographic marks: “…” in English and «…» in Spanish, never straight quotes in prose (launch U1)", () => {
    for (const locale of HELP_LOCALES) {
      for (const source of readHelpSources(locale)) {
        // Code spans and fenced blocks keep their literal quotes (`"stream": false`).
        const prose = source.body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
        expect(prose, `${locale}/${source.slug}: straight double quote`).not.toContain('"');
        if (locale === "es") expect(prose, `${locale}/${source.slug}: use «…» in Spanish`).not.toMatch(/[“”]/);
      }
    }
  });

  it("points every contextual help link at an article section that exists in both languages", () => {
    for (const [key, target] of Object.entries(CONTEXT_HELP)) {
      for (const locale of HELP_LOCALES) {
        const item = article(locale, target.slug);
        expect(item, `${key} (${locale})`).toBeTruthy();
        if ("section" in target && target.section) expect(h2(item), `${key} (${locale})`).toContain(target.section);
      }
    }
  });
});
