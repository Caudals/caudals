import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
  locales,
} from "@/lib/i18n/config";
import { detectPreferredLocale } from "@/lib/i18n/detect-locale";
import { getClientIP, getCountryFromIP } from "@/lib/i18n/geolocation";

const supportedLocales = new Set<Locale>(locales);

function normalizeLocale(value?: string | null): Locale | null {
  if (!value) return null;
  if (supportedLocales.has(value as Locale)) return value as Locale;
  const base = value.split("-")[0];
  return supportedLocales.has(base as Locale) ? (base as Locale) : null;
}

/**
 * Get country code from request headers or IP geolocation
 * Supports both platform-specific headers (Vercel, Cloudflare, AWS) and IP-based detection
 */
async function getRequestCountryCode(request: NextRequest): Promise<string | null> {
  // First, try platform-specific headers (fast, no API call needed)
  const headerCountry = 
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    request.headers.get("cloudfront-viewer-country") ??
    request.headers.get("x-forwarded-country") ??
    null;

  if (headerCountry) {
    console.log(`[i18n] Country from header: ${headerCountry}`);
    return headerCountry;
  }

  // Fallback to IP-based geolocation (for self-hosted environments like Dokploy)
  const clientIP = getClientIP(request.headers);
  if (clientIP) {
    console.log(`[i18n] Client IP: ${clientIP}`);
    const country = await getCountryFromIP(clientIP);
    if (country) {
      console.log(`[i18n] Country from IP: ${country}`);
      return country;
    }
  }

  console.log("[i18n] No country detected");
  return null;
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const cookieLocale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  
  // Get country code and language header
  const countryCode = await getRequestCountryCode(request);
  const acceptLanguage = request.headers.get("accept-language");
  
  console.log(`[i18n] Cookie locale: ${cookieLocale}, Country: ${countryCode}, Accept-Language: ${acceptLanguage}`);
  
  // Detect locale from all available sources
  const detectedLocale = detectPreferredLocale({
    header: acceptLanguage,
    countryCode: countryCode,
  });

  console.log(`[i18n] Detected locale: ${detectedLocale}`);

  // Logic for setting/updating cookie:
  // 1. If no cookie exists: set detected locale
  // 2. If cookie exists but we detect Spain (ES): always override to Spanish (strongest signal)
  // 3. If cookie exists and matches detected: do nothing
  // 4. Otherwise: keep existing cookie (user preference)
  
  let shouldUpdateCookie = false;
  let localeToSet = cookieLocale ?? detectedLocale;

  if (!cookieLocale) {
    // First visit: set detected locale
    shouldUpdateCookie = true;
    localeToSet = detectedLocale;
    console.log(`[i18n] No cookie found, setting: ${localeToSet}`);
  } else if (countryCode === "ES" && cookieLocale !== "es") {
    // User is in Spain but cookie is not Spanish: override (strongest signal)
    shouldUpdateCookie = true;
    localeToSet = "es";
    console.log(`[i18n] User in Spain, forcing Spanish`);
  } else if (cookieLocale !== detectedLocale && countryCode) {
    // Country changed and we have strong evidence
    shouldUpdateCookie = true;
    localeToSet = detectedLocale;
    console.log(`[i18n] Country-based override: ${localeToSet}`);
  }

  if (shouldUpdateCookie) {
    response.cookies.set(LOCALE_COOKIE, localeToSet, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    console.log(`[i18n] Cookie set to: ${localeToSet}`);
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
