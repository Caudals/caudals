import matter from "gray-matter";
import { slugifyHeading } from "@/lib/blog/shared";

export const ALLOWED_BLOG_MDX_COMPONENTS = new Set([
  "Callout",
  "YouTube",
  "DataBudgetCalculator",
  "DataSourceQuiz",
  "FineTuningEstimator",
  "ActiveLearningLoop",
  "PreferencePairPlanner",
  "EvalDatasetPlanner",
]);

const COVER_VARIANTS = new Set(["signal", "grid", "ledger"]);
const PRIVATE_DISCOVERY_ROUTES = /^\/(?:admin|auth|buyer|supplier|v1)(?:\/|$)/;

export type BlogPreflightIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  line?: number;
};

export type BlogPreflightResult = {
  valid: boolean;
  issues: BlogPreflightIssue[];
};

function lineOf(source: string, offset: number) {
  return source.slice(0, offset).split("\n").length;
}

function issue(issues: BlogPreflightIssue[], severity: BlogPreflightIssue["severity"], code: string, message: string, line?: number) {
  issues.push({ severity, code, message, ...(line ? { line } : {}) });
}

function requiredString(data: Record<string, unknown>, key: string, issues: BlogPreflightIssue[]) {
  if (typeof data[key] !== "string" || !data[key].trim()) {
    issue(issues, "error", `frontmatter.${key}`, `Frontmatter field "${key}" is required.`);
  }
}

function outsideCodeFences(body: string) {
  let fence: "```" | "~~~" | null = null;
  return body.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s*(```|~~~)/)?.[1] as "```" | "~~~" | undefined;
    if (marker && (!fence || fence === marker)) {
      fence = fence ? null : marker;
      return "";
    }
    return fence ? "" : line;
  }).join("\n");
}

export function preflightBlogSource(source: string, context: { slug: string; locale: string }): BlogPreflightResult {
  const issues: BlogPreflightIssue[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(context.slug)) {
    issue(issues, "error", "slug", "Slug must be lowercase ASCII words separated by hyphens.");
  }
  if (!new Set(["en", "es"]).has(context.locale)) {
    issue(issues, "error", "locale", "Locale must be en or es.");
  }
  if (Buffer.byteLength(source, "utf8") > 250_000) {
    issue(issues, "error", "size", "Article exceeds the 250 kB source limit.");
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(source);
  } catch (error) {
    issue(issues, "error", "frontmatter.parse", `Frontmatter is invalid: ${error instanceof Error ? error.message : String(error)}`);
    return { valid: false, issues };
  }

  const data = parsed.data as Record<string, unknown>;
  for (const key of ["title", "excerpt", "author", "authorRole", "category", "categoryKey"]) {
    requiredString(data, key, issues);
  }
  const publishedAt = data.publishedAt;
  if (!(typeof publishedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) && !(publishedAt instanceof Date && !Number.isNaN(publishedAt.getTime()))) {
    issue(issues, "error", "frontmatter.publishedAt", "publishedAt must use YYYY-MM-DD.");
  }
  if (typeof data.categoryKey === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.categoryKey)) {
    issue(issues, "error", "frontmatter.categoryKey", "categoryKey must be a stable lowercase key.");
  }
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((tag) => typeof tag !== "string" || !tag.trim()))) {
    issue(issues, "error", "frontmatter.tags", "tags must be a non-empty string array.");
  }
  if (data.featured !== undefined && typeof data.featured !== "boolean") {
    issue(issues, "error", "frontmatter.featured", "featured must be true or false.");
  }
  if (data.coverVariant !== undefined && !COVER_VARIANTS.has(String(data.coverVariant))) {
    issue(issues, "error", "frontmatter.coverVariant", "coverVariant must be signal, grid, or ledger.");
  }

  const body = parsed.content;
  const markup = outsideCodeFences(body);
  const bodyStartsAt = lineOf(source, source.indexOf(body));
  const markupLine = (offset: number) => bodyStartsAt + lineOf(markup, offset) - 1;
  if (!body.trim()) issue(issues, "error", "body.empty", "Article body is empty.");
  const forbidden = [
    { pattern: /^\s*(?:import|export)\s/m, code: "mdx.module", message: "Imports and exports are not allowed." },
    { pattern: /^---\s*$/m, code: "mdx.frontmatter", message: "A second frontmatter block is not allowed." },
    { pattern: /<\s*\/?\s*(?:script|style|form|iframe|object|embed|canvas)\b/i, code: "mdx.element", message: "Unsafe HTML element is not allowed." },
    { pattern: /<\s*\/?\s*[a-z][a-z0-9-]*\b/, code: "mdx.raw_html", message: "Raw HTML is not allowed; use Markdown or an allowlisted component." },
    { pattern: /\son[a-z]+\s*=/i, code: "mdx.handler", message: "Event handlers are not allowed." },
    { pattern: /\bjavascript:/i, code: "mdx.javascript_url", message: "JavaScript URLs are not allowed." },
  ];
  for (const check of forbidden) {
    const match = check.pattern.exec(markup);
    if (match) issue(issues, "error", check.code, check.message, markupLine(match.index));
  }

  for (const match of markup.matchAll(/<\/?([A-Z][A-Za-z0-9]*)\b/g)) {
    const component = match[1];
    if (component && !ALLOWED_BLOG_MDX_COMPONENTS.has(component)) {
      issue(issues, "error", "mdx.component", `MDX component "${component}" is not allowlisted.`, markupLine(match.index ?? 0));
    }
  }
  for (const match of markup.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (!match[1]?.trim()) issue(issues, "error", "image.alt", "Every Markdown image needs useful alt text.", markupLine(match.index ?? 0));
    const target = match[2]?.trim() ?? "";
    if (!/^(?:https:\/\/|\/)/i.test(target)) issue(issues, "error", "image.url", `Unsupported image URL "${target.slice(0, 100)}".`);
  }
  for (const match of markup.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim() ?? "";
    if (!/^(?:https?:\/\/|\/|#)/i.test(target)) issue(issues, "error", "link.url", `Unsupported link target "${target.slice(0, 100)}".`);
    if (PRIVATE_DISCOVERY_ROUTES.test(target)) issue(issues, "error", "link.private_route", `Landing-mode blog content may not promote private route "${target}".`);
  }

  const headingIds = new Set<string>();
  let sawH2 = false;
  for (const [index, line] of markup.split(/\r?\n/).entries()) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    if (match[1] === "#") issue(issues, "error", "heading.h1", "The article page supplies the only h1.", index + 1);
    if ((match[1]?.length ?? 0) > 3) issue(issues, "error", "heading.depth", "Only h2 and h3 headings are supported.", index + 1);
    if (!['##', '###'].includes(match[1] ?? '')) continue;
    if (match[1] === "##") sawH2 = true;
    if (match[1] === "###" && !sawH2) issue(issues, "error", "heading.order", "An h3 cannot appear before the first h2.", index + 1);
    const id = slugifyHeading(match[2].replace(/[`*_~]/g, ""));
    if (headingIds.has(id)) issue(issues, "error", "heading.duplicate", `Duplicate heading anchor "${id}".`, index + 1);
    headingIds.add(id);
  }
  if (!sawH2) issue(issues, "warning", "heading.missing_h2", "Article has no h2 section.");

  return { valid: issues.every((entry) => entry.severity !== "error"), issues };
}

export function assertBlogSource(source: string, context: { slug: string; locale: string }) {
  const result = preflightBlogSource(source, context);
  if (!result.valid) {
    const summary = result.issues.filter((entry) => entry.severity === "error").map((entry) => `${entry.code}${entry.line ? `:${entry.line}` : ""} ${entry.message}`).join("; ");
    throw new Error(`Blog preflight failed for ${context.locale}/${context.slug}: ${summary}`);
  }
  return result;
}
