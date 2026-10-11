import { matchAcceptLanguage } from "@/lib/i18n/negotiate";
import type { Locale } from "@/lib/evals/messages/en";

/**
 * Interface language for one app request. An explicit choice (the
 * `caudals_locale` cookie) wins; otherwise the browser's stated languages
 * decide, so a Spanish browser opens the app in Spanish. No country hint:
 * someone in Spain whose browser asks for English keeps English.
 */
export function resolveInterfaceLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (cookie === "es" || cookie === "en") return cookie;
  return matchAcceptLanguage(acceptLanguage) === "es" ? "es" : "en";
}
