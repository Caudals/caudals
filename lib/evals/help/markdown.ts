/**
 * The Markdown subset help articles are written in (launch L-20), parsed into
 * a small block tree that the platform kit renders on the server and in the
 * browser. Anything outside the subset is reported by `markdownProblems`, which
 * the content lint runs on every article, so an article can never depend on
 * syntax the renderer would print literally.
 *
 * Blocks: `## Title {#id}` and `### Title`, paragraphs, `- ` and `1. ` lists
 * (one level), and fenced code. Inline: `**strong**`, `*emphasis*`, `` `code` ``
 * and `[text](href)` where href is `help:slug`, `help:slug#section`, an app path
 * (`/workspace/…`), `https://…` or `mailto:…`.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 2 | 3; id: string; children: Inline[]; text: string }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; text: string };

const HEADING = /^(#{2,3})\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?\s*$/;
const BULLET = /^-\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const FENCE = /^```/;

/** Lower-case, accent-free, hyphenated: the anchor of a heading without an explicit id. */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Inline syntax: strong before emphasis, code spans are literal, links nest one level. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("`")) {
      const end = source.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ kind: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = source.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "strong", children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (rest.startsWith("*")) {
      const end = source.indexOf("*", i + 1);
      if (end > i + 1 && source[i + 1] !== " ") {
        flush();
        out.push({ kind: "em", children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("[")) {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (match) {
        flush();
        out.push({ kind: "link", href: match[2], children: parseInline(match[1]) });
        i += match[0].length;
        continue;
      }
    }
    text += source[i];
    i += 1;
  }
  flush();
  return out;
}

/** Plain text of inline content (search, headings, page titles). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((node) => (node.kind === "text" || node.kind === "code" ? node.text : inlineText(node.children))).join("");
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    if (FENCE.test(line.trim())) {
      flushParagraph();
      flushList();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index].trim())) body.push(lines[index++]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const children = parseInline(heading[2]);
      const text = inlineText(children);
      blocks.push({ kind: "heading", level: heading[1].length as 2 | 3, id: heading[3] ?? slugifyHeading(text), children, text });
      continue;
    }
    const bullet = BULLET.exec(line.trim());
    const numbered = NUMBERED.exec(line.trim());
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // A wrapped list item continues on an indented line.
      const items = (list as { items: string[] }).items;
      items[items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text of a whole article, for search. */
export function blocksText(blocks: Block[]): string {
  return blocks
    .map((block) =>
      block.kind === "heading"
        ? block.text
        : block.kind === "paragraph"
          ? inlineText(block.children)
          : block.kind === "list"
            ? block.items.map(inlineText).join(" ")
            : block.text,
    )
    .join(" ");
}

/** Every link target in an article. */
export function linkTargets(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.kind === "link") out.push(node.href);
      if (node.kind === "link" || node.kind === "strong" || node.kind === "em") walk(node.children);
    }
  };
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "paragraph") walk(block.children);
    if (block.kind === "list") block.items.forEach(walk);
  }
  return out;
}

const UNSUPPORTED: Array<[RegExp, string]> = [
  [/^#\s/m, "level-1 heading (the title comes from the front matter)"],
  [/^#{4,}\s/m, "heading deeper than ###"],
  [/^\s*\|.*\|\s*$/m, "table"],
  [/^>\s?/m, "blockquote"],
  [/!\[[^\]]*\]\(/, "image"],
  [/<[a-z][^>]*>/i, "raw HTML"],
  [/^\s{2,}[-*]\s/m, "nested list"],
  [/^\*\s/m, "list marked with * (use -)"],
  [/__[^_]+__/, "underscore emphasis (use ** or *)"],
];

/** Syntax outside the subset, as human-readable problems (empty when the article is clean). */
export function markdownProblems(source: string): string[] {
  const withoutCode = source.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return UNSUPPORTED.filter(([pattern]) => pattern.test(withoutCode)).map(([, label]) => `unsupported Markdown: ${label}`);
}
