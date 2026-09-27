import "server-only";

import { getTranslator } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { renderEvaluationOverviewMarkdown } from "@/lib/public/evaluation-offers";
import { homeFaqItems } from "@/lib/public/home-faq";
import {
  SECTOR_IDS,
  SECTORS_HUB_PATH,
  sectorPath,
  type SectorId,
} from "@/lib/public/sectors";
import { getSectorCopy, type FailureCause } from "@/lib/sectors/content";
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

/** Internal pathname → sector, for the sector pages. */
const SECTOR_PAGES = new Map<string, SectorId>(
  SECTOR_IDS.map((id) => [sectorPath(id), id]),
);

export function isStaticMarkdownPage(pathname: string) {
  return (
    Object.hasOwn(STATIC_PAGES, pathname) ||
    Object.hasOwn(LEGAL_DOCUMENTS, pathname) ||
    pathname === SECTORS_HUB_PATH ||
    SECTOR_PAGES.has(pathname)
  );
}

const FAILURE_ORDER: readonly FailureCause[] = [
  "invented",
  "outdated",
  "wrongSource",
  "gap",
  "outOfScope",
];

/** A sector page as prose: every section an agent would otherwise have to scrape. */
function renderSectorBody(id: SectorId, locale: Locale) {
  const copy = getSectorCopy(id, locale);
  const t = getTranslator(locale);
  const list = (items: readonly string[]) => items.map((item) => `- ${item}`).join("\n");

  const failures = FAILURE_ORDER.map((cause) => {
    const example = copy.failures.examples[cause];
    return [
      `### ${t(`steps.exam.causes.${cause}.name`)}`,
      "",
      t(`steps.exam.causes.${cause}.description`),
      "",
      `- ${t("agents.question")}: “${example.q}”`,
      `- ${t("steps.exam.aiAnswer")}: “${example.a}”`,
      `- ${t("steps.exam.key")}: ${example.doc} (${example.src})`,
    ].join("\n");
  }).join("\n\n");

  return [
    copy.subtitle,
    `${copy.stakes.lead} ${copy.stakes.solution}`,
    `**${t("sectors.audienceLabel")}:** ${copy.audience}`,
    `## ${copy.tested.title}`,
    copy.tested.description,
    `### ${t("sectors.systemsLabel")}`,
    list(copy.tested.systems),
    `### ${t("sectors.topicsLabel")}`,
    list(copy.tested.topics),
    `## ${copy.failures.title}`,
    copy.failures.description,
    failures,
    `## ${copy.experts.title}`,
    copy.experts.description,
    list(copy.experts.roles.map((role) => role.label)),
    list(copy.experts.datasets.map((item) => `**${item.name}:** ${item.description}`)),
    `## ${t("sectors.faqTitle")}`,
    copy.faq.map((item) => `### ${item.q}\n\n${item.a}`).join("\n\n"),
  ].join("\n\n");
}

function renderSectorsHubBody(locale: Locale) {
  return SECTOR_IDS.map((id) => {
    const copy = getSectorCopy(id, locale);
    const url = buildMarketingUrl(localizePathname(sectorPath(id), locale));
    return `- [${copy.name}](${url}): ${copy.summary}`;
  }).join("\n");
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
  const sectorId = SECTOR_PAGES.get(pathname);
  if (sectorId) {
    const copy = getSectorCopy(sectorId, locale);
    title = copy.metaTitle;
    description = copy.metaDescription;
    body = renderSectorBody(sectorId, locale);
  } else if (pathname === SECTORS_HUB_PATH) {
    title = t("sectors.hubMetaTitle");
    description = t("sectors.hubSubtitle");
    body = renderSectorsHubBody(locale);
  } else if (legalId) {
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
    // The home page carries the evaluation model, its prices and the FAQ, rendered from
    // the same source as the landing page so the two cannot disagree.
    body =
      pathname === "/"
        ? [
            renderEvaluationOverviewMarkdown(t),
            `## ${t("faq.title")}`,
            ...homeFaqItems(t).map(({ q, a }) => `### ${q}\n\n${a}`),
          ].join("\n\n")
        : undefined;
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
