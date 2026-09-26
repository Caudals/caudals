import type { Metadata, MetadataRoute } from "next";
import {
  defaultLocale,
  localeOpenGraph,
  locales,
  type Locale,
} from "@/lib/i18n/config";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePathname } from "@/lib/i18n/routing";
import { SECTOR_IDS, SECTORS_HUB_PATH, sectorPath } from "@/lib/public/sectors";

export const SITE_NAME = "Caudals";

/** The brand's X account, declared as `twitter:site` on every public page. */
export const TWITTER_HANDLE = "@caudalshq";

/**
 * Site-level title and description per locale. Each language carries its own
 * so the two versions compete for their own queries rather than sharing one
 * set of Spanish metadata across both URLs.
 */
export const SITE_TITLES: Record<Locale, string> = {
  en: "Independent evaluation for AI assistants | Caudals",
  es: "Evaluación independiente de asistentes de IA | Caudals",
};

export const SITE_DESCRIPTIONS: Record<Locale, string> = {
  en: "Caudals evaluates AI assistants, chatbots and agents with questions drawn from your own documentation and answer keys signed off by our domain experts. A scored, evidence-backed report.",
  es: "Caudals evalúa asistentes, chatbots y agentes de IA con preguntas sacadas de tu propia documentación y respuestas validadas por nuestros expertos de dominio. Informe con puntuación y evidencias.",
};

export const SITE_KEYWORDS: Record<Locale, string[]> = {
  en: [
    "AI assistant evaluation",
    "chatbot evaluation",
    "AI agent evaluation",
    "AI answer quality",
    "AI test set",
    "LLM evaluation",
  ],
  es: [
    "evaluación de asistentes de IA",
    "evaluación de chatbots",
    "evaluación de agentes de IA",
    "calidad de respuestas de IA",
    "conjunto de pruebas para IA",
    "evaluación de LLM",
  ],
};

export function getSiteTitle(locale: Locale = defaultLocale) {
  return SITE_TITLES[locale] ?? SITE_TITLES[defaultLocale];
}

export function getSiteDescription(locale: Locale = defaultLocale) {
  return SITE_DESCRIPTIONS[locale] ?? SITE_DESCRIPTIONS[defaultLocale];
}

/** Retained for callers that predate locale-aware metadata. */
export const DEFAULT_SITE_TITLE = SITE_TITLES[defaultLocale];
export const DEFAULT_SITE_DESCRIPTION = SITE_DESCRIPTIONS[defaultLocale];

const DEFAULT_SOCIAL_IMAGE_PATH = "/brand.png";
const DEFAULT_MARKETING_HOSTNAME = "caudals.com";
const DEFAULT_APP_HOSTNAME = "app.caudals.com";
const TRAILING_BRAND_PATTERN = /\s*(?:\||—)\s*Caudals\s*$/i;

export type IndexableMarketingRoute = {
  pathname: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  /**
   * Date the page's content last changed (YYYY-MM-DD), emitted as `<lastmod>`.
   * Update it with the copy; leave it out rather than guess, because search
   * engines stop trusting a lastmod that changes when the page does not.
   */
  lastModified?: string;
};

/** Content date of the sector pages; bump it when their copy changes. */
const SECTOR_PAGES_UPDATED = "2026-09-27";

const MARKETING_ROUTES: IndexableMarketingRoute[] = [
  { pathname: "/", changeFrequency: "weekly", priority: 1, lastModified: "2026-09-26" },
  {
    pathname: SECTORS_HUB_PATH,
    changeFrequency: "monthly",
    priority: 0.9,
    lastModified: SECTOR_PAGES_UPDATED,
  },
  ...SECTOR_IDS.map(
    (id): IndexableMarketingRoute => ({
      pathname: sectorPath(id),
      changeFrequency: "monthly",
      priority: 0.9,
      lastModified: SECTOR_PAGES_UPDATED,
    }),
  ),
  // Temporarily hidden:
  // { pathname: "/blog", changeFrequency: "weekly", priority: 0.9 },
  { pathname: "/call", changeFrequency: "monthly", priority: 0.8 },
  { pathname: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { pathname: "/legal/cookies", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/notice", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  // Temporarily hidden:
  // { pathname: "/newsletter", changeFrequency: "weekly", priority: 0.85 },
];

type PublicMetadataOptions = {
  title?: string;
  description: string;
  /** Locale-free pathname, e.g. "/blog". The locale prefix is added here. */
  pathname: string;
  /** Language of the page being rendered. Drives canonical, hreflang and og:locale. */
  locale?: Locale;
  /**
   * An explicit share image. Leave it out on pages under `app/[locale]`: the
   * nearest `opengraph-image.tsx` then supplies a 1200 × 630 card, which X
   * also uses in the absence of `twitter:image`.
   */
  imagePath?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  authors?: string[];
  section?: string;
};

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function stripTrailingBrand(title: string) {
  return title.replace(TRAILING_BRAND_PATTERN, "").trim();
}

export function buildBrandedTitle(title: string) {
  const phrase = stripTrailingBrand(title);
  return phrase === SITE_NAME ? SITE_NAME : `${phrase} | ${SITE_NAME}`;
}

function parseEnvHostnames(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, ""))
    .filter(Boolean);
}

function hostnameToOrigin(hostname: string) {
  const protocol =
    hostname.startsWith("localhost") || hostname.startsWith("127.0.0.1")
      ? "http"
      : "https";

  return `${protocol}://${hostname}`;
}

function getPrimaryHostname(hostnames: string[], fallback: string) {
  return hostnames[0] ?? fallback;
}

function buildRobots(index: boolean, follow: boolean): Metadata["robots"] {
  return {
    index,
    follow,
    googleBot: {
      index,
      follow,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };
}

export function getMarketingSiteOrigin() {
  const configuredHostnames = parseEnvHostnames(
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAMES
  );

  return hostnameToOrigin(
    getPrimaryHostname(configuredHostnames, DEFAULT_MARKETING_HOSTNAME)
  );
}

export function getAppSiteOrigin() {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicitUrl) {
    return normalizeOrigin(explicitUrl);
  }

  const configuredHostnames = parseEnvHostnames(
    process.env.NEXT_PUBLIC_APP_HOSTNAMES
  );

  return hostnameToOrigin(
    getPrimaryHostname(configuredHostnames, DEFAULT_APP_HOSTNAME)
  );
}

export function buildMarketingUrl(pathname = "/") {
  return new URL(
    normalizePathname(pathname),
    `${getMarketingSiteOrigin()}/`
  ).toString();
}

export function buildAppUrl(pathname = "/") {
  return new URL(normalizePathname(pathname), `${getAppSiteOrigin()}/`).toString();
}

export function getDefaultSocialImageUrl() {
  return buildMarketingUrl(DEFAULT_SOCIAL_IMAGE_PATH);
}

export function getIndexableMarketingRoutes() {
  return MARKETING_ROUTES.map((route) => ({ ...route }));
}

export function buildPublicMetadata({
  title,
  description,
  pathname,
  locale = defaultLocale,
  imagePath,
  type = "website",
  noIndex = false,
  publishedTime,
  modifiedTime,
  keywords,
  authors,
  section,
}: PublicMetadataOptions): Metadata {
  const documentTitle = title ? stripTrailingBrand(title) : undefined;
  const resolvedTitle = title ? buildBrandedTitle(title) : getSiteTitle(locale);
  // The canonical URL carries this page's own locale prefix, and every
  // supported locale is published as an hreflang alternate alongside it.
  const url = buildMarketingUrl(localizePathname(pathname, locale));
  const imageUrl = imagePath ? buildMarketingUrl(imagePath) : undefined;

  return {
    ...(documentTitle ? { title: documentTitle } : {}),
    description,
    alternates: buildAlternates(pathname, locale, buildMarketingUrl),
    keywords,
    authors: authors?.map((name) => ({ name })),
    robots: buildRobots(!noIndex, !noIndex),
    openGraph: {
      type,
      url,
      title: resolvedTitle,
      description,
      siteName: SITE_NAME,
      locale: localeOpenGraph[locale],
      alternateLocale: locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => localeOpenGraph[candidate]),
      ...(imageUrl ? { images: [{ url: imageUrl, alt: resolvedTitle }] } : {}),
      ...(type === "article"
        ? {
            publishedTime,
            modifiedTime,
            authors,
            section,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title: resolvedTitle,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export function buildNoIndexMetadata(
  title?: string,
  description?: string
): Metadata {
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    robots: buildRobots(false, false),
  };
}
