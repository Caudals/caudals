import type { Metadata, MetadataRoute } from "next";

export const SITE_NAME = "Caudals";
export const DEFAULT_SITE_TITLE = "Evaluación independiente de asistentes de IA | Caudals";
export const DEFAULT_SITE_DESCRIPTION =
  "Caudals evalúa asistentes, chatbots y agentes de IA con preguntas sacadas de tu propia documentación y respuestas validadas por nuestros expertos de dominio. Informe con puntuación y evidencias.";

const DEFAULT_SOCIAL_IMAGE_PATH = "/brand.png";
const DEFAULT_MARKETING_HOSTNAME = "caudals.com";
const DEFAULT_APP_HOSTNAME = "app.caudals.com";
const TRAILING_BRAND_PATTERN = /\s*(?:\||—)\s*Caudals\s*$/i;

export type IndexableMarketingRoute = {
  pathname: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

const MARKETING_ROUTES: IndexableMarketingRoute[] = [
  { pathname: "/", changeFrequency: "weekly", priority: 1 },
  { pathname: "/blog", changeFrequency: "weekly", priority: 0.9 },
  { pathname: "/call", changeFrequency: "monthly", priority: 0.8 },
  { pathname: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { pathname: "/legal/cookies", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/notice", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/newsletter", changeFrequency: "weekly", priority: 0.85 },
];

type PublicMetadataOptions = {
  title?: string;
  description: string;
  pathname: string;
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
  imagePath = DEFAULT_SOCIAL_IMAGE_PATH,
  type = "website",
  noIndex = false,
  publishedTime,
  modifiedTime,
  keywords,
  authors,
  section,
}: PublicMetadataOptions): Metadata {
  const documentTitle = title ? stripTrailingBrand(title) : undefined;
  const resolvedTitle = title ? buildBrandedTitle(title) : DEFAULT_SITE_TITLE;
  const url = buildMarketingUrl(pathname);
  const imageUrl = buildMarketingUrl(imagePath);

  return {
    ...(documentTitle ? { title: documentTitle } : {}),
    description,
    alternates: {
      canonical: url,
    },
    keywords,
    authors: authors?.map((name) => ({ name })),
    robots: buildRobots(!noIndex, !noIndex),
    openGraph: {
      type,
      url,
      title: resolvedTitle,
      description,
      siteName: SITE_NAME,
      locale: "es_ES",
      images: [
        {
          url: imageUrl,
          alt: resolvedTitle,
        },
      ],
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
      title: resolvedTitle,
      description,
      images: [imageUrl],
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
