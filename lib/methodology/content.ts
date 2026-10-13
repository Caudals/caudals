import en from "@/content/methodology/en.json";
import es from "@/content/methodology/es.json";
import type { Locale } from "@/lib/i18n/config";

/**
 * The public methodology page (`/{locale}/methodology`, `/es/metodologia`;
 * launch L-20, P-40). Copy lives in content/methodology because only this
 * server-rendered page and its agent markdown read it. It must match
 * docs/evals/grading-engine.md; lib/methodology/content.test.ts checks EN/ES
 * parity, the interval table against the scorer and the claims.
 */
export const METHODOLOGY_PATH = "/methodology";
/** Content date: shown as "Last updated" and used as the sitemap lastmod. */
export const METHODOLOGY_UPDATED = "2026-10-12";

export type MethodologyVerdict = "correct" | "partial" | "incorrect" | "no_answer" | "unscored";
export type MethodologyLabels = {
  columns: string[];
  yes: string;
  no: string;
  rows: Array<{ verdict: MethodologyVerdict; label: string; scored: boolean; meaning: string }>;
};
export type MethodologySection = {
  id: string;
  title: string;
  body?: string[];
  items?: string[];
  after?: string[];
  labels?: MethodologyLabels;
  table?: { columns: string[]; rows: string[][] };
};
export type MethodologyCopy = {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  standfirst: string;
  updated: string;
  contents: string;
  sections: MethodologySection[];
  ctaTitle: string;
  ctaBody: string;
  ctaDemo: string;
  ctaContact: string;
  ctaCall: string;
};

const COPY: Record<Locale, MethodologyCopy> = { en: en as MethodologyCopy, es: es as MethodologyCopy };

export function methodologyCopy(locale: Locale): MethodologyCopy {
  return COPY[locale];
}

/** `**bold**` inside an item, as used by the review levels. */
export function splitStrong(text: string): { strong: string | null; rest: string } {
  const match = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(text);
  return match ? { strong: match[1], rest: match[2] } : { strong: null, rest: text };
}

export function formatMethodologyDate(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${METHODOLOGY_UPDATED}T00:00:00Z`));
}

const cell = (value: string) => value.replaceAll("|", "\\|").replace(/\s+/g, " ");
const table = (columns: string[], rows: string[][]) =>
  [`| ${columns.map(cell).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n");

/** The page as Markdown, for agents that ask for `text/markdown` (same content as the HTML). */
export function renderMethodologyMarkdown(locale: Locale): { title: string; description: string; body: string } {
  const copy = methodologyCopy(locale);
  const title = copy.title.replace(/\*([^*]+)\*/g, "$1");
  const sections = copy.sections.map((section, index) => {
    const parts = [`## ${index + 1}. ${section.title}`, ...(section.body ?? [])];
    if (section.items?.length) parts.push(section.items.map((item) => `- ${item}`).join("\n"));
    if (section.labels) {
      const { columns, rows, yes, no } = section.labels;
      parts.push(table(columns, rows.map((row) => [row.label, row.scored ? yes : no, row.meaning])));
    }
    if (section.table) parts.push(table(section.table.columns, section.table.rows));
    parts.push(...(section.after ?? []));
    return parts.join("\n\n");
  });
  return {
    title,
    description: copy.standfirst,
    body: [copy.updated.replace("{date}", formatMethodologyDate(locale)), ...sections].join("\n\n"),
  };
}
