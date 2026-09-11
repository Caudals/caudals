import "server-only";

import type { Metadata } from "next";
import { createTranslator } from "@/lib/i18n/create-translator";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { renderEvaluationOverviewMarkdown } from "@/lib/public/evaluation-offers";
import { buildMarketingUrl, getIndexableMarketingRoutes } from "@/lib/seo";

/**
 * Static marketing pages are React components with no markdown source, so the
 * markdown representation is built from the metadata each page already exports.
 * Reading it at request time keeps the two from drifting apart.
 */
const STATIC_PAGE_LOADERS: Record<string, () => Promise<{ metadata?: Metadata }>> = {
  "/": () => import("@/app/(home)/page"),
  "/call": () => import("@/app/(home)/call/page"),
  "/contact": () => import("@/app/(home)/contact/page"),
  "/legal/cookies": () => import("@/app/(home)/legal/cookies/page"),
  "/legal/notice": () => import("@/app/(home)/legal/notice/page"),
  "/legal/privacy": () => import("@/app/(home)/legal/privacy/page"),
  "/legal/terms": () => import("@/app/(home)/legal/terms/page"),
};

/**
 * Body sections for pages whose metadata alone would undersell them. The home
 * page carries the evaluation model and its prices, rendered from the same
 * source as the landing page so the two cannot disagree.
 */
const STATIC_PAGE_BODIES: Record<string, () => string> = {
  "/": () => renderEvaluationOverviewMarkdown(createTranslator("es", getDictionary("es"))),
};

export function isStaticMarkdownPage(pathname: string) {
  return Object.hasOwn(STATIC_PAGE_LOADERS, pathname);
}

function metadataText(value: unknown): string {
  if (typeof value === "string") return value;
  // Next's Metadata title may be an object ({ absolute, default, template }).
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["absolute", "default"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "";
}

/** Related links, so an agent landing on one page can reach the rest of the site. */
function relatedLinks(currentPath: string) {
  return getIndexableMarketingRoutes()
    .filter((route) => route.pathname !== currentPath)
    .map((route) => `- [${route.pathname}](${buildMarketingUrl(route.pathname)})`)
    .join("\n");
}

export async function renderStaticPageMarkdown(pathname: string) {
  const loader = STATIC_PAGE_LOADERS[pathname];
  if (!loader) return null;

  let metadata: Metadata | undefined;
  try {
    metadata = (await loader()).metadata;
  } catch (error) {
    console.error(`[Markdown] Failed to load metadata for "${pathname}":`, error);
    return null;
  }

  const title = metadataText(metadata?.title) || "Caudals";
  const description = metadataText(metadata?.description);

  const sections = [
    `# ${title}`,
    description,
    STATIC_PAGE_BODIES[pathname]?.(),
    "## Otras páginas",
    relatedLinks(pathname),
    `---\n\nCanonical URL: ${buildMarketingUrl(pathname)}`,
  ].filter(Boolean);

  return sections.join("\n\n");
}
