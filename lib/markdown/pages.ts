import "server-only";

import { getTranslator } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { renderEvaluationOverviewMarkdown } from "@/lib/public/evaluation-offers";
import { buildMarketingUrl, getIndexableMarketingRoutes } from "@/lib/seo";

/**
 * Markdown representations of the static marketing pages, for agents that ask
 * for `text/markdown`.
 *
 * Title and description come from the same message files the rendered pages
 * use, so the two cannot drift apart, and each page is produced in the locale
 * the request resolved to.
 */
type StaticPageCopy = {
  title: MessageKey;
  description: MessageKey;
};

const STATIC_PAGES: Record<string, StaticPageCopy> = {
  "/": { title: "structuredData.webPageName", description: "hero.subtitle" },
  "/call": { title: "call.title", description: "call.subtitle" },
  "/contact": { title: "contact.title", description: "contact.subtitle" },
  "/legal/cookies": { title: "cookies.title", description: "cookies.body" },
};

/** Legal documents render from their own content files rather than messages. */
const LEGAL_DOCUMENTS = {
  "/legal/cookies": "cookies",
  "/legal/notice": "notice",
  "/legal/privacy": "privacy",
  "/legal/terms": "terms",
} as const;

export function isStaticMarkdownPage(pathname: string) {
  return (
    Object.hasOwn(STATIC_PAGES, pathname) ||
    Object.hasOwn(LEGAL_DOCUMENTS, pathname)
  );
}

/** Related links, so an agent landing on one page can reach the rest of the site. */
function relatedLinks(currentPath: string, locale: Locale) {
  return getIndexableMarketingRoutes()
    .filter((route) => route.pathname !== currentPath)
    .map((route) => {
      const localized = localizePathname(route.pathname, locale);
      return `- [${localized}](${buildMarketingUrl(localized)})`;
    })
    .join("\n");
}

export async function renderStaticPageMarkdown(
  pathname: string,
  locale: Locale,
) {
  const t = getTranslator(locale);

  let title: string;
  let description: string;
  let body: string | undefined;

  const legalId = LEGAL_DOCUMENTS[pathname as keyof typeof LEGAL_DOCUMENTS];
  if (legalId) {
    const { getLegalDocument } = await import("@/lib/legal/documents");
    const document = getLegalDocument(legalId, locale);
    title = document.title;
    description = document.description;
    body = document.sections
      .map((section) => `## ${section.title}\n\n${section.body}`)
      .join("\n\n");
  } else {
    const copy = STATIC_PAGES[pathname];
    if (!copy) return null;
    title = t(copy.title);
    description = t(copy.description);
    // The home page carries the evaluation model and its prices, rendered from
    // the same source as the landing page so the two cannot disagree.
    body = pathname === "/" ? renderEvaluationOverviewMarkdown(t) : undefined;
  }

  const canonical = buildMarketingUrl(localizePathname(pathname, locale));

  return [
    `# ${title}`,
    description,
    body,
    `## ${t("agents.otherPages")}`,
    relatedLinks(pathname, locale),
    `---\n\n${t("agents.canonicalUrl")}: ${canonical}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
