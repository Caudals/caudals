import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
  locales,
} from "@/lib/i18n/config";
import { detectPreferredLocale } from "@/lib/i18n/detect-locale";

const supportedLocales = new Set<Locale>(locales);

function normalizeLocale(value?: string | null): Locale | null {
  if (!value) return null;
  if (supportedLocales.has(value as Locale)) return value as Locale;
  const base = value.split("-")[0];
  return supportedLocales.has(base as Locale) ? (base as Locale) : null;
}

function getRequestCountryCode(request: NextRequest): string | null {
  // Check multiple sources for country code (Vercel, Cloudflare, AWS, etc.)
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    request.headers.get("cloudfront-viewer-country") ??
    request.headers.get("x-forwarded-country") ??
    null
  );
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const cookieLocale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  
  // Get country code and language header
  const countryCode = getRequestCountryCode(request);
  const acceptLanguage = request.headers.get("accept-language");
  
  // Detect locale from all available sources
  const detectedLocale = detectPreferredLocale({
    header: acceptLanguage,
    countryCode: countryCode,
  });

  // Set cookie if:
  // 1. No cookie exists, OR
  // 2. Cookie exists but detected locale is different AND we have strong evidence (country code or explicit language)
  const shouldUpdateCookie = !cookieLocale || 
    (cookieLocale !== detectedLocale && (countryCode || acceptLanguage));

  if (shouldUpdateCookie) {
    const localeToSet = cookieLocale ?? detectedLocale;
    response.cookies.set(LOCALE_COOKIE, localeToSet, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
