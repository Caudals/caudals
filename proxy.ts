import { NextResponse, type NextRequest } from "next/server";
import { shouldBlockPhaseOneHiddenSurface } from "@/lib/phase-one-surface-gates";
import {
  MARKDOWN_ROUTE_PREFIX,
  prefersMarkdown,
} from "@/lib/markdown/negotiation";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import {
  getCountryFromHeaders,
  negotiateLocale,
} from "@/lib/i18n/negotiate";
import {
  findInternalPathnameInAnyLocale,
  hasUnsupportedLocalePrefix,
  isNonLocalizedPath,
  localizePathname,
  PATHNAME_HEADER,
  splitLocale,
  toInternalPathname,
  toPublicPathname,
} from "@/lib/i18n/routing";

const EVALS_PREFIXES = ["/ops", "/workspace", "/share", "/evaluation-entry"];
const APP_ONLY_PATH_PREFIXES = [
  "/requester",
  "/contributor",
  "/admin",
  "/auth",
  "/pwa",
];
const DEFAULT_APP_HOSTNAMES = ["app.caudals.com", "app.localhost:3000", "www.app.caudals.com"];
const DEFAULT_MARKETING_HOSTNAMES = ["caudals.com", "www.caudals.com"];

type HostConfig = {
  hostname: string;
  port?: string;
};

function cleanHostname(value?: string | null): string {
  if (!value) return "";
  const host = value.trim();
  if (!host) return "";
  const [hostname] = host.split(":");
  return hostname?.toLowerCase() ?? "";
}

function parseHostConfigs(
  value: string | undefined,
  fallback: string[]
): HostConfig[] {
  const entries = value ? value.split(",") : fallback;
  return entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, port] = entry.split(":");
      const hostname = cleanHostname(host);
      return {
        hostname,
        port: port?.trim(),
      };
    })
    .filter((config) => config.hostname);
}

function parseHostnameList(
  value: string | undefined,
  fallback: string[]
): string[] {
  const entries = value ? value.split(",") : fallback;
  return entries.map((entry) => cleanHostname(entry)).filter(Boolean);
}

const appHostConfigs = parseHostConfigs(
  process.env.NEXT_PUBLIC_APP_HOSTNAMES,
  DEFAULT_APP_HOSTNAMES
);
const marketingHostnames = parseHostnameList(
  process.env.NEXT_PUBLIC_MARKETING_HOSTNAMES,
  DEFAULT_MARKETING_HOSTNAMES
);
const primaryAppHost = appHostConfigs[0];

function extractHostname(request: NextRequest): string {
  return cleanHostname(request.headers.get("host") ?? request.nextUrl.hostname);
}

function matchesAppOnlyPath(pathname: string): boolean {
  return APP_ONLY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isRedirectResponse(response: NextResponse) {
  return response.status >= 300 && response.status < 400;
}

function rewriteWithState(
  request: NextRequest,
  sourceResponse: NextResponse,
  targetPath: string
) {
  const url = request.nextUrl.clone();
  url.pathname = targetPath;
  const rewritten = NextResponse.rewrite(url);

  // Copy headers except set-cookie (handled via cookies API)
  sourceResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    rewritten.headers.set(key, value);
  });

  sourceResponse.cookies.getAll().forEach((cookie) => {
    rewritten.cookies.set(cookie);
  });

  return rewritten;
}

function isEvalsPath(pathname: string) {
  return EVALS_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/")) || pathname.startsWith("/api/evals/");
}

export async function proxy(request: NextRequest) {
  const hostname = extractHostname(request);
  const pathname = request.nextUrl.pathname;
  const isAppHost = appHostConfigs.some(
    (config) => config.hostname === hostname
  );
  const isMarketingHost = marketingHostnames.includes(hostname);
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isAppHost && !isMarketingHost && !isLocalhost) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // One public host. `www.caudals.com` answers with a permanent redirect to
  // the bare domain, so search engines never index the site twice.
  const bareMarketingHost = hostname.startsWith("www.") ? hostname.slice(4) : null;
  if (isMarketingHost && bareMarketingHost && marketingHostnames.includes(bareMarketingHost)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https:";
    redirectUrl.hostname = bareMarketingHost;
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isMarketingHost && isEvalsPath(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (shouldBlockPhaseOneHiddenSurface(pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // Blog and Newsletter are temporarily hidden: redirect requests to home (307 Temporary Redirect).
  if (!isAppHost) {
    const { locale: hiddenPathLocale, pathname: hiddenBarePathname } = splitLocale(pathname);
    if (
      hiddenBarePathname === "/blog" ||
      hiddenBarePathname.startsWith("/blog/") ||
      hiddenBarePathname === "/newsletter" ||
      hiddenBarePathname.startsWith("/newsletter/")
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = hiddenPathLocale ? `/${hiddenPathLocale}` : "/";
      return NextResponse.redirect(redirectUrl, 307);
    }
  }

  // Content negotiation for agents: a request that explicitly prefers
  // `text/markdown` is rewritten to the markdown renderer. This sits after the
  // 404 and authentication gates above so markdown cannot reach a surface that
  // HTML could not, and before locale handling because the renderer resolves
  // its own locale.
  if (
    !matchesAppOnlyPath(pathname) &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith(MARKDOWN_ROUTE_PREFIX) &&
    prefersMarkdown(request.headers.get("accept"))
  ) {
    const markdownUrl = request.nextUrl.clone();
    markdownUrl.pathname = `${MARKDOWN_ROUTE_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(markdownUrl);
  }

  if (isMarketingHost && matchesAppOnlyPath(pathname) && primaryAppHost) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.hostname = primaryAppHost.hostname;
    redirectUrl.port = primaryAppHost.port ?? "";
    return NextResponse.redirect(redirectUrl);
  }

  const isAppRoot = isAppHost && pathname === "/";

  // ---- Locale routing (public marketing host only) -----------------------
  //
  // Public pages live under `/{locale}/...`. A request without a locale prefix
  // is redirected once to the negotiated locale; from then on the URL itself
  // carries the language, so nothing downstream has to guess and every page
  // has a single canonical address.
  //
  // Internal surfaces (`/auth`, evaluation routes, APIs and
  // machine-readable files) are never prefixed and never redirected here —
  // that separation is required by AGENTS.md.
  if (!isAppHost && !isAppRoot && !isNonLocalizedPath(pathname)) {
    // `/fr/blog` names a language we do not publish. Prefixing it would
    // produce `/en/fr/blog`, so it is answered as a miss instead.
    if (hasUnsupportedLocalePrefix(pathname)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const { locale: pathLocale, pathname: barePathname } = splitLocale(pathname);

    if (!pathLocale) {
      const { locale } = negotiateLocale({
        cookie: request.cookies.get(LOCALE_COOKIE)?.value,
        acceptLanguage: request.headers.get("accept-language"),
        countryCode: getCountryFromHeaders(request.headers),
      });

      const redirectUrl = request.nextUrl.clone();
      // A translated slug typed without its prefix (`/sectores/seguros`) is
      // mapped to its page first, then localized for the negotiated language.
      const internalPathname =
        findInternalPathnameInAnyLocale(barePathname) ?? barePathname;
      redirectUrl.pathname = localizePathname(internalPathname, locale);
      // 307 keeps the method and, unlike a 308, lets the negotiated target
      // change later without being cached permanently by browsers.
      const redirect = NextResponse.redirect(redirectUrl, 307);
      // Negotiation varies on these, so shared caches must not reuse one
      // visitor's redirect for another.
      redirect.headers.set("vary", "accept-language, cookie");
      return redirect;
    }

    // Translated slugs. `/es/sectores/seguros` is served by the internal route
    // `/es/sectors/insurance`; the internal form, or another language's slug,
    // is redirected permanently to the one public URL for this locale.
    const internalPathname = toInternalPathname(barePathname, pathLocale);
    if (internalPathname !== barePathname) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/${pathLocale}${internalPathname}`;
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(PATHNAME_HEADER, pathname);
      return NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });
    }

    const canonicalInternal =
      toPublicPathname(barePathname, pathLocale) !== barePathname
        ? barePathname
        : findInternalPathnameInAnyLocale(barePathname);
    const canonicalPathname = canonicalInternal
      ? localizePathname(canonicalInternal, pathLocale)
      : null;
    if (canonicalPathname && canonicalPathname !== pathname) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = canonicalPathname;
      return NextResponse.redirect(redirectUrl, 308);
    }
  }

  // The root layout reads this back to label `<html lang>`, so the document
  // language always matches the URL that served it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (isAppHost) {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-robots-tag", "noindex");
    response.headers.set("x-middleware-request-x-evals-surface", "1");
  }

  if (isAppRoot && !isRedirectResponse(response)) {
    return rewriteWithState(request, response, "/evaluation-entry");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf|splinecode)$).*)",
  ],
};
