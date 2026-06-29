const LANDING_MODE_ALLOWED_PAGE_PATHS = new Set([
  "/",
  "/contact",
  "/book",
  "/blog",
]);
const LANDING_MODE_ALLOWED_PAGE_PREFIXES = ["/blog/"];
const LANDING_MODE_ALLOWED_PRIVATE_PAGE_PATHS = new Set([
  "/admin",
  "/auth",
  "/buyer",
  "/security",
  "/supplier",
  "/v1",
]);
const LANDING_MODE_ALLOWED_PRIVATE_PAGE_PREFIXES = [
  "/auth/",
  "/buyer/",
  "/security/",
  "/supplier/",
  "/v1/",
];
const LANDING_MODE_ALLOWED_API_PATHS = new Set([
  "/api/analytics/track",
  "/api/contact",
  "/api/user/role",
  "/api/waitlist",
]);
const LANDING_MODE_ALLOWED_API_PREFIXES = ["/api/auth/"];
const SITE_VERIFICATION_HTML_PATTERN = /^\/google[a-z0-9]+\.html$/i;
const STATIC_ASSET_PATH_PATTERN =
  /\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|txt|xml|webmanifest|splinecode)$/i;

export const landingModePublicNavigationLinks = [
  { href: "/contact", label: "Contacto" },
  { href: "/blog", label: "Blog" },
] as const;

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export const landingModePublicEnabled =
  process.env.NEXT_PUBLIC_LANDING_MODE === "true";

export function isLandingModeEnabledServer() {
  return process.env.LANDING_MODE === "true";
}

export function isLandingModeApiPathAllowed(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return (
    LANDING_MODE_ALLOWED_API_PATHS.has(normalizedPathname) ||
    LANDING_MODE_ALLOWED_API_PREFIXES.some((prefix) =>
      normalizedPathname.startsWith(prefix)
    )
  );
}

export function isLandingModeStaticAssetPath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return (
    normalizedPathname.startsWith("/_next") ||
    SITE_VERIFICATION_HTML_PATTERN.test(normalizedPathname) ||
    STATIC_ASSET_PATH_PATTERN.test(normalizedPathname)
  );
}

export function isLandingModePagePathAllowed(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return (
    LANDING_MODE_ALLOWED_PAGE_PATHS.has(normalizedPathname) ||
    LANDING_MODE_ALLOWED_PRIVATE_PAGE_PATHS.has(normalizedPathname) ||
    LANDING_MODE_ALLOWED_PAGE_PREFIXES.some((prefix) =>
      normalizedPathname.startsWith(prefix)
    ) ||
    LANDING_MODE_ALLOWED_PRIVATE_PAGE_PREFIXES.some((prefix) =>
      normalizedPathname.startsWith(prefix)
    ) ||
    isLandingModeStaticAssetPath(normalizedPathname)
  );
}

export function isLandingModeRequestAllowed(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname.startsWith("/api")) {
    return isLandingModeApiPathAllowed(normalizedPathname);
  }

  return isLandingModePagePathAllowed(normalizedPathname);
}
