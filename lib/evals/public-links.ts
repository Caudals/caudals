import type { Locale } from "@/lib/evals/messages/en";
import { localizePathname } from "@/lib/i18n/routing";

/** The public site, linked from the app (help, reports). */
export const MARKETING_ORIGIN = "https://caudals.com";

/** A public page in the person's language, e.g. `/call` → https://caudals.com/es/llamada. */
export function marketingUrl(pathname: string, locale: Locale) {
  return new URL(localizePathname(pathname, locale), MARKETING_ORIGIN).toString();
}

/** The public methodology (launch L-20): how tests are written, graded and reviewed. */
export function methodologyUrl(locale: Locale, section?: string) {
  return `${marketingUrl("/methodology", locale)}${section ? `#${section}` : ""}`;
}
